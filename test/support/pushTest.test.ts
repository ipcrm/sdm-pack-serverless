import {InMemoryProject} from "@atomist/automation-client";
import * as assert from "power-assert";
import {IsServerlessDeployable} from "../../lib/support/pushTest";

describe("IsServerlessDeployable", () => {
    it("should return true if a serverless.yaml file is present", async () => {
        const project = InMemoryProject.of({path: "serverless.yaml", content: ""});
        const result = await IsServerlessDeployable.predicate(project);
        assert(result);
    });
    it("should return true if a serverless.yml file is present", async () => {
        const project = InMemoryProject.of({path: "serverless.yml", content: ""});
        const result = await IsServerlessDeployable.predicate(project);
        assert(result);
    });
    it("should return true if serverless.yml file is not on root", async () => {
        const project = InMemoryProject.of({path: "some/fake/path/serverless.yml", content: ""});
        const result = await IsServerlessDeployable.predicate(project);
        assert(result);
    });
    it("should return false if serverless.yml does not exist", async () => {
        const project = InMemoryProject.of();
        const result = await IsServerlessDeployable.predicate(project);
        assert(!result);
    });
});
