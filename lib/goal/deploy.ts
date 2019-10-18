import {Configuration, GitProject, logger} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    doWithProject,
    ExecuteGoal,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal, GoalDefinition, GoalDetails,
    IndependentOfEnvironment,
    SoftwareDeliveryMachineConfiguration,
    spawnLog,
    StringCapturingProgressLog,
    SuccessIsReturn0ErrorFinder,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import stripAnsi from "strip-ansi";

export type ServerlessConfigLocator = (p: GitProject) => Promise<string>;

const ServerlessGoalDefinition: GoalDefinition = {
    displayName: "deploying via Serverless.com",
    uniqueName: "serverless-deploy",
    environment: IndependentOfEnvironment,
    workingDescription: "Deploying via Serverless.com",
    completedDescription: "Deployed via Serverless.com",
    failedDescription: "Deployment via Serverless.com failed",
    waitingForApprovalDescription: "Waiting for deployment approval",
    waitingForPreApprovalDescription: "Waiting to start Serverless.com deployment",
    stoppedDescription: "Deployment via Serverless.com stopped",
    canceledDescription: "Deployment via Serverless.com cancelled",
    retryFeasible: true,
};

interface ServerlessDeployDetails {
    /**
     * Supply full path to serverless command.  Optional.
     */
    cmd?: string;

    /**
     * Serverless Personal Access key.  Optional.  If not supplied you must set this value
     * via the environment (SERVERLESS_ACCESS_KEY), or you must have already created a local
     * config file for serverless (via Serverless config command)
     */
    accessKey?: string;

    /**
     * Additional deployment arguments
     */
    deployArgs?: Record<string, string>;

    /**
     * Run Serverless Test?  (If serverless.test.yml is present)
     */
    runTest?: boolean;

    /**
     * Test Args
     */
    testArgs?: Record<string, string>;

    /**
     * Serverless Config file path.  Optional.
     *
     * Supply a fixed path or a function to locate where the Serverless config file is located.
     */
    serverlessConfig?: string | ServerlessConfigLocator;

    /**
     * Env Vars
     *
     * Extra environment variables to be supplied to the Serverless command executions.  Optional.
     */
    envVars?: Record<string, string>;

    /**
     * Using this option you can have a remote SDM execute the deployment action.  Typically this is used to traverse
     * security zones or use unique credentials, etc.  The goal must be defined in both SDMs, however only one SDM should
     * schedule the goals.
     */
    remoteExecution?: {
        /**
         * Name of the remote SDM to launc this goal
         */
        registrationName: string;

        /**
         * Stage for this deployment (just a friendly name)
         */
        stage: string;
    };
}

export class ServerlessDeploy extends FulfillableGoalWithRegistrations<ServerlessDeployDetails> {
    // tslint:disable-next-line
    constructor(protected details: FulfillableGoalDetails | string = DefaultGoalNameGenerator.generateName("serverless-deploy"),
                ...dependsOn: Goal[]) {

        super({
            ...ServerlessGoalDefinition,
            ...getGoalDefinitionFrom(details, DefaultGoalNameGenerator.generateName("serverless-deploy")),
        }, ...dependsOn);
    }

    public with(
        registration: ServerlessDeployDetails,
    ): this {
        const registrationName = `serverless-deploy`;
        this.addFulfillment({
            name: determineRegistrationName(registration, this.sdm.configuration),
            goalExecutor: serverlessDeploy(registration),
            progressReporter: log => {
                const re = /Serverless: (.*)/i;
                const line = re.exec(log);
                if (line) {
                    return { phase: stripAnsi(line[0].trim()).replace("Serverless: ", "") };
                }
                return {};
            },
        });
        return this;
    }
}

export function serverlessDeploy(registration: ServerlessDeployDetails): ExecuteGoal {
    return doWithProject(async gi => {
        // Validate this SDM is supposed to handle this deployment
        const myReg = determineThisRegistrationName(registration, gi.configuration);
        if (!gi.goalEvent.fulfillment.name.includes(myReg)) {
            logger.debug(`Not running Serverless deploy for ${gi.goalEvent.uniqueName}, it's fulfillment target is ${gi.goalEvent.fulfillment.name}`);
            return {
                code: 0,
                state: gi.goalEvent.state,
            };
        }

        // Start execution
        gi.progressLog.write(`Starting Serverless deploy`);
        const pl = new WriteToAllProgressLog("combinedLog", gi.progressLog, new StringCapturingProgressLog());

        // Test if we have the creds we need to run a deployment
        if (!process.env.SERVERLESS_ACCESS_KEY && !registration.accessKey) {
            gi.progressLog.write(`Warning: No Serverless credentials supplied, relying on pre-existing host configuration...`);
        }

        // Determine args
        let newArgs: string[] = [];
        if (registration.deployArgs) {
            newArgs = Object.keys(registration.deployArgs).map(a => `--${a}=${registration.deployArgs[a]}`);
        }

        // Locate Config file
        const config = registration.serverlessConfig ? [ "--config", await findServerlessConfig(gi.project, registration)] : [];

        // Execute deploy
        const result = await spawnLog(
            registration.cmd ? registration.cmd : "serverless",
            ["deploy", ...config, ...newArgs],
            {
                cwd: gi.project.baseDir,
                env: {
                    ...process.env,
                    ...registration.envVars,
                    SERVERLESS_ACCESS_KEY: process.env.SERVERLESS_ACCESS_KEY || registration.accessKey,
                },
                log: pl,
                errorFinder: SuccessIsReturn0ErrorFinder,
            },
        );

        if (result && result.code !== 0) {
            return result;
        }

        const urls: GoalDetails["externalUrls"] = [];
        try {
            const re = /Serverless Dashboard(.*)(https:\/\/[0-9A-Za-z.\/-]+)/;
            const dashUrl = re.exec(pl.log)[2];
            if (dashUrl) {
                urls.push(
                    {label: "Dashboard", url: dashUrl},
                );
            }
        } catch (e) {
            logger.warn(`Couldn't parse Dashboard URL (Enterprise may not be in use)`);
        }

        // Run serverless smoke tests
        if (
            registration.runTest &&
            await gi.project.hasFile("serverless.test.yml")
        ) {
            let newTestArgs: string[] = [];
            if (registration.testArgs) {
                newTestArgs = Object.keys(registration.testArgs).map(a => `--${a}=${registration.testArgs[a]}`);
            }

            gi.progressLog.write(`Serverless: Starting Tests...`);
            const res = await spawnLog(
                registration.cmd ? registration.cmd : "serverless",
                ["test", ...newTestArgs],
                {
                    cwd: gi.project.baseDir,
                    env: {
                        ...process.env,
                        ...registration.envVars,
                        SERVERLESS_ACCESS_KEY: process.env.SERVERLESS_ACCESS_KEY || registration.accessKey,
                    },
                    log: pl,
                    errorFinder: SuccessIsReturn0ErrorFinder,
                },
            );

            if (res && res.code !== 0) {
                return res;
            }
        }

        return {
            code: 0,
            externalUrls: [
                ...urls,
            ],
        };
    });
}

export async function findServerlessConfig(p: GitProject, registration: ServerlessDeployDetails): Promise<string> {
    let configPath: string;
    if (typeof registration.serverlessConfig === "string") {
        configPath = registration.serverlessConfig;
    } else if (typeof registration.serverlessConfig === "function") {
        configPath = await registration.serverlessConfig(p);
    }

    if (typeof configPath !== "string") {
        throw new Error(`Serverless Config Path must be a string!  Got ${typeof configPath}!`);
    }
    return configPath;
}

function determineRegistrationName(registration: ServerlessDeployDetails, config: Configuration & SoftwareDeliveryMachineConfiguration): string {
    const registrationName = `serverless-deploy`;
    return registration.remoteExecution ?
            `${registration.remoteExecution.registrationName}-${registration.remoteExecution.stage}-${registrationName}` :
            `${config.name}-${registrationName}`;
}

function determineThisRegistrationName(registration: ServerlessDeployDetails, config: Configuration & SoftwareDeliveryMachineConfiguration): string {
    const registrationName = `serverless-deploy`;
    return registration.remoteExecution ?
        `${config.name}-${registration.remoteExecution.stage}-${registrationName}` :
        `${config.name}-${registrationName}`;
}
