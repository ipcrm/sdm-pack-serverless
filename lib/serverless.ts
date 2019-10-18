import {ExtensionPack, metadata} from "@atomist/sdm";
import {ServerlessFulfillGoalOnRequested} from "./event/OnRequestedSdmGoal";

export const serverlessSupport = (): ExtensionPack => {
    return {
        ...metadata(),
        requiredConfigurationValues: [],
        configure: sdm => {
            sdm.configuration.events = [
                () => new ServerlessFulfillGoalOnRequested((sdm as any).goalFulfillmentMapper,
                [...sdm.goalExecutionListeners]),
            ];
            return sdm;
        },
    };
};
