import {GitProject, InMemoryProject, projectUtils} from "@atomist/automation-client";
import * as assert from "power-assert";
import {findServerlessConfig} from "../../lib/goal/deploy";

describe("findServerlessConfig", () => {
  it ("should return the same string as supplied in registration", async () => {
    const project = InMemoryProject.of();
    const config = await findServerlessConfig(project as any, {serverlessConfig: "myfile.yaml"});
    assert.strictEqual(config, "myfile.yaml");
  });
  it ("should execute the supplied locator function and return a string", async () => {
    const project = InMemoryProject.of({path: "myfile.yaml", content: ""});
    const config = await findServerlessConfig(
        project as any,
        {
          serverlessConfig: async p => {
              let c: string;
              await projectUtils.doWithFiles(p, "**/myfile.yaml", f => {
                  c = f.path;
              });
              return c;
          },
        });
    assert.strictEqual(config, "myfile.yaml");
  });
});
