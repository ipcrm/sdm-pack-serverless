import {GitProject} from "@atomist/automation-client";
import {
    DefaultGoalNameGenerator,
    doWithProject,
    ExecuteGoal,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal, GoalDetails,
    Implementation,
    spawnLog,
    StringCapturingProgressLog,
    SuccessIsReturn0ErrorFinder,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import stripAnsi from "strip-ansi";

export type ServerlessConfigLocator = (p: GitProject) => Promise<string>;

interface ServerlessDeployDetails {
    /**
     * Supply full path to serverless command.  Optional.
     */
    cmd?: string;

    /**
     * Serverless Personal Access key.  Optional.  If not supplied you must set this value
     * via the environment
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
}

export class ServerlessDeploy extends FulfillableGoalWithRegistrations<ServerlessDeployDetails> {
    // tslint:disable-next-line
    constructor(protected details: FulfillableGoalDetails | string = DefaultGoalNameGenerator.generateName("serverless-deploy"),
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefinitionFrom(details, DefaultGoalNameGenerator.generateName("serverless-deploy")),
        }, ...dependsOn);
    }

    public with(
        registration: ServerlessDeployDetails,
    ): this {
        // tslint:disable-next-line:no-object-literal-type-assertion
        this.addFulfillment({
            name: DefaultGoalNameGenerator.generateName("serverless-deploy"),
            goalExecutor: serverlessDeploy(registration),
            progressReporter: log => {
                const re = /Serverless: (.*)/i;
                const line = re.exec(log);
                if (line) {
                    return { phase: stripAnsi(line[0].trim()).replace("Serverless: ", "") };
                }
                return {};
            },
        } as Implementation);
        return this;
    }
}

export function serverlessDeploy(registration: ServerlessDeployDetails): ExecuteGoal {
    return doWithProject(async gi => {
        gi.progressLog.write(`Starting Serverless deploy`);
        const pl = new WriteToAllProgressLog("combinedLog", gi.progressLog, new StringCapturingProgressLog());

        // Test if we have the creds we need to run a deployment
        if (!process.env.SERVERLESS_ACCESS_KEY && !registration.accessKey) {
            return {
                code: 1,
                message: `Missing Serverless Access key, cannot deploy`,
            };
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
        const re = /Serverless Dashboard(.*)(https:\/\/[0-9A-Za-z.\/-]+)/;
        const dashUrl = re.exec(pl.log)[2];
        if (dashUrl) {
            urls.push(
                {label: "Dashboard", url: dashUrl},
            );
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
