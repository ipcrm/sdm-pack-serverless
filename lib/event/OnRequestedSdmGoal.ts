/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    automationClientInstance, configurationValue,
    EventFired,
    GraphQL,
    HandlerContext,
    HandlerResult,
    logger,
    NoParameters,
    OnEvent,
    Success,
} from "@atomist/automation-client";
import {
    addressChannelsFor,
    cancelableGoal,
    descriptionFromState, EventHandlerRegistration,
    executeGoal,
    formatDate,
    GoalInvocation,
    GoalScheduler,
    isGoalCanceled,
    LoggingProgressLog,
    ProgressLog,
    resolveCredentialsPromise,
    SdmGoalEvent,
    SdmGoalState,
    serializeResult,
    SoftwareDeliveryMachineConfiguration,
    updateGoal,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import {isGoalRelevant} from "@atomist/sdm-core/lib/internal/delivery/goals/support/validateGoal";
import {verifyGoal} from "@atomist/sdm-core/lib/internal/signing/goalSigning";
import {formatDuration} from "@atomist/sdm-core/lib/util/misc/time";
import { SdmGoalFulfillmentMethod } from "@atomist/sdm/lib/api/goal/SdmGoalMessage";
import {OnAnyRequestedSdmGoal} from "../typings/types";

/**
 * Handle a Serverless Deployment goal that is targeting this SDM for fulfillment
 */
export const ServerlessFulfillGoalOnRequestedHandler: OnEvent<OnAnyRequestedSdmGoal.Subscription, OnAnyRequestedSdmGoal.Variables> = async (
    event: EventFired<OnAnyRequestedSdmGoal.Subscription>,
    context: HandlerContext,
): Promise<HandlerResult> => {
    const sdmGoal = event.data.SdmGoal[0] as SdmGoalEvent;
    const configuration = configurationValue<SoftwareDeliveryMachineConfiguration>();

    /**
     * Did this SDM schedule this goal?
     *
     * If it did, this handler should exit and allow the default `FulfillGoalOnRequested` handler to process this goal.
     * This handler is only used to process goals that were setup to fulfill on remote SDMs for Serverless Deployments
     */
    if (isGoalRelevant(sdmGoal)) {
        logger.debug(`Serverless Deployment Handler: Goal ${sdmGoal.uniqueName} skipped because it will be processed by the default handler`);
        return Success;
    }

    // Determine if this fulfillment name matches our SDM instance and is a Serverless Deploy
    if (!(sdmGoal.fulfillment.name.includes(`${configuration.name}-serverless-deploy`))) {
        logger.debug(`Serverless Deployment Handler: Goal ${sdmGoal.uniqueName} skipped because it is not a Serverless goal meant for this SDM`);
        return Success;
    }

    // Handle Goal signing
    await verifyGoal(sdmGoal, configuration.sdm.goalSigning, context);

    if ((await cancelableGoal(sdmGoal, configuration)) && (await isGoalCanceled(sdmGoal, context))) {
        logger.debug(`Goal ${sdmGoal.uniqueName} has been canceled. Not fulfilling`);
        return Success;
    }

    if (sdmGoal.fulfillment.method === SdmGoalFulfillmentMethod.SideEffect) {
        logger.debug("Not fulfilling side-effected goal '%s' with method '%s/%s'",
            sdmGoal.uniqueName, sdmGoal.fulfillment.method, sdmGoal.fulfillment.name);
        return Success;
    } else if (sdmGoal.fulfillment.method === SdmGoalFulfillmentMethod.Other) {
        // fail goal with neither Sdm nor SideEffect fulfillment
        await updateGoal(
            context,
            sdmGoal,
            {
                state: SdmGoalState.failure,
                description: `No fulfillment for ${sdmGoal.uniqueName}`,
            });
        return Success;
    }

    const id = configuration.sdm.repoRefResolver.repoRefFromSdmGoal(sdmGoal);
    const credentials = await resolveCredentialsPromise(configuration.sdm.credentialsResolver.eventHandlerCredentials(context, id));
    const addressChannels = addressChannelsFor(sdmGoal.push.repo, context);
    const preferences = configuration.sdm.preferenceStoreFactory(context);

    const implementation = configuration.implementationMapper.findImplementationBySdmGoal(sdmGoal);
    const { goal } = implementation;

    const progressLog = new WriteToAllProgressLog(
        sdmGoal.name,
        new LoggingProgressLog(sdmGoal.name, "debug"),
        await configuration.sdm.logFactory(context, sdmGoal));

    const goalInvocation: GoalInvocation = {
        configuration,
        sdmGoal,
        goalEvent: sdmGoal,
        goal,
        progressLog,
        context,
        addressChannels,
        preferences,
        id,
        credentials,
    };

    const goalScheduler = await findGoalScheduler(goalInvocation, configuration);
    if (!!goalScheduler) {
        const start = Date.now();
        const result = await goalScheduler.schedule(goalInvocation);
        if (!!result && result.code !== undefined && result.code !== 0) {
            await updateGoal(context, sdmGoal, {
                state: SdmGoalState.failure,
                description: `Failed to schedule goal`,
                url: progressLog.url,
            });
            await reportEndAndClose(result, start, progressLog);
        } else {
            await updateGoal(context, sdmGoal, {
                state: !!result && !!result.state ? result.state : SdmGoalState.in_process,
                phase: !!result && !!result.phase ? result.phase : "scheduled",
                description: !!result && !!result.description ? result.description : descriptionFromState(goal, SdmGoalState.in_process),
                url: progressLog.url,
                externalUrls: !!result ? result.externalUrls : undefined,
            });
        }
        return {
            ...result as any,
            // successfully handled event even if goal failed
            code: 0,
        };
    } else {
        delete (sdmGoal as any).id;

        await reportStart(sdmGoal, progressLog);
        const start = Date.now();

        try {
            const result = await executeGoal(
                {
                    projectLoader: configuration.sdm.projectLoader,
                    goalExecutionListeners: configuration.goalExecutionListeners,
                },
                implementation,
                goalInvocation);
            await reportEndAndClose(result, start, progressLog);
            return {
                ...result,
                // successfully handled event even if goal failed
                code: 0,
            };
        } catch (e) {
            await reportEndAndClose(e, start, progressLog);
            throw e;
        }
    }
};

export const ServerlessFulfillGoalOnRequested: EventHandlerRegistration<NoParameters> = {
    name: "ServerlessFulfillGoalOnRequested",
    subscription: GraphQL.subscription({name: "OnAnyRequestedSdmGoal"}),
    listener: ServerlessFulfillGoalOnRequestedHandler,
};

async function findGoalScheduler(gi: GoalInvocation,
                                 configuration: SoftwareDeliveryMachineConfiguration): Promise<GoalScheduler | undefined> {
    let goalSchedulers: GoalScheduler[];
    if (!configuration.sdm.goalScheduler) {
        return undefined;
    } else if (!Array.isArray(configuration.sdm.goalScheduler)) {
        goalSchedulers = [configuration.sdm.goalScheduler];
    } else {
        goalSchedulers = configuration.sdm.goalScheduler;
    }
    for (const gl of goalSchedulers) {
        if (await gl.supports(gi)) {
            return gl;
        }
    }
    return undefined;
}

async function reportStart(sdmGoal: SdmGoalEvent, progressLog: ProgressLog): Promise<void> {
    progressLog.write(`/--`);
    progressLog.write(`Start: ${formatDate(new Date(), "yyyy-mm-dd HH:MM:ss.l")}`);
    progressLog.write(`Repository: ${sdmGoal.push.repo.owner}/${sdmGoal.push.repo.name}/${sdmGoal.branch}`);
    progressLog.write(`Sha: ${sdmGoal.sha}`);
    progressLog.write(`Goal: ${sdmGoal.name} (${sdmGoal.uniqueName})`);
    progressLog.write(`Environment: ${sdmGoal.environment.slice(2)}`);
    progressLog.write(`GoalSet: ${sdmGoal.goalSet} - ${sdmGoal.goalSetId}`);
    progressLog.write(
        `SDM: ${automationClientInstance().configuration.name}:${automationClientInstance().configuration.version}`);
    progressLog.write("\\--");
    await progressLog.flush();
}

async function reportEndAndClose(result: any, start: number, progressLog: ProgressLog): Promise<void> {
    progressLog.write(`/--`);
    progressLog.write(`Result: ${serializeResult(result)}`);
    progressLog.write(`Duration: ${formatDuration(Date.now() - start)}`);
    progressLog.write(`Finish: ${formatDate(new Date(), "yyyy-mm-dd HH:MM:ss.l")}`);
    progressLog.write("\\--");
    await progressLog.close();
}
