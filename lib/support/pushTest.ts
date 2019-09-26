import {projectUtils} from "@atomist/automation-client";
import {predicatePushTest, PredicatePushTest} from "@atomist/sdm";

export const IsServerlessDeployable: PredicatePushTest = predicatePushTest(
    "IsServerlessDeployable",
    async p => {
        return projectUtils.fileExists(p, "**/serverless.y{,a}ml");
    },
);
