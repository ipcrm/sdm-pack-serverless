import {
    configure,
} from "@atomist/sdm-core";
import {ServerlessDeploy} from "../lib/goal/deploy";
import {serverlessSupport} from "../lib/serverless";
import {IsServerlessDeployable} from "../lib/support/pushTest";

export const configuration = configure(async sdm => {
    sdm.addExtensionPacks(
        serverlessSupport(),
    );
    return {
        serverless: {
            test: IsServerlessDeployable,
            goals: [
                new ServerlessDeploy()
                    .with({
                        deployArgs: { stage: "dev" },
                    }),
            ],
        },
    };
});
