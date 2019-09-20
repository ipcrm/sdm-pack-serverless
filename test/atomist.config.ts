import {
    Configuration,
} from "@atomist/automation-client";
import {
    goals,
    onAnyPush,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import {ServerlessDeploy} from "../lib/goal/deploy";

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
    );

    const dev = new ServerlessDeploy({
        uniqueName: "serverless-deploy-dev",
    })
        .with({
            deployArgs: {
                stage: "dev",
            },
        });

    const qa = new ServerlessDeploy({
        uniqueName: "serverless-deploy-qa",
        preApproval: true,
    })
        .with({
            deployArgs: {
                stage: "qa",
            },
        });

    const prod = new ServerlessDeploy({
        uniqueName: "serverless-deploy-prod",
        preApproval: true,
    })
        .with({
            deployArgs: {
                stage: "prod",
            },
        });

    const serverlessDeploy = goals("deploy-serverless")
        .plan(dev)
        .plan(qa).after(dev)
        .plan(prod).after(qa);

    sdm.withPushRules(
        onAnyPush()
            .setGoals(serverlessDeploy),
    );

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
