<p align="center">
  <img src="https://images.atomist.com/sdm/SDM-Logo-Dark.png">
</p>

# @ipcrm/sdm-pack-serverless

This SDM Extension pack adds functionality to integrate with [Serverless.com](https://serverless.com).

## Usage

> Note: This pack does not require being registered via `sdm.AddExtensionPacks`.

To define a new Serverless deploy goal:

```typescript
    const dev = new ServerlessDeploy({
        uniqueName: "serverless-deploy-dev",
    }).with({
        deployArgs: { stage: "dev" },
    });
```

Within the ServerlessDeploy constructor you may supply any of the values in [PredicateGoalDefinition](https://atomist.github.io/sdm/interfaces/_lib_api_goal_goalwithfulfillment_.predicatedgoaldefinition.html) or [Goal](https://atomist.github.io/sdm/classes/_lib_api_goal_goal_.goal.html) to customize the display values or behavior of the goal.
The registration (passed to the `with` method) uses the `ServerlessDeployDetails` interface (see typings for details) allows you to customize the details of how the serverless command is called.

> Important: The Serverless.com command must be installed in the environment the SDM is running on

This pack expects to find a `serverless.yaml` (or yml) file in the project, by default (you can customize the file location, name, etc in `ServerlessDeployDetails`).  If found, the goal will continue to execute the deployment process.

## Getting started

See the [Developer Quick Start][atomist-quick] to jump straight to
creating an SDM.

[atomist-quick]: https://docs.atomist.com/quick-start/ (Atomist - Developer Quick Start)

## Contributing

Contributions to this project from community members are encouraged
and appreciated. Please review the [Contributing
Guidelines](CONTRIBUTING.md) for more information. Also see the
[Development](#development) section in this document.

## Code of conduct

This project is governed by the [Code of
Conduct](CODE_OF_CONDUCT.md). You are expected to act in accordance
with this code by participating. Please report any unacceptable
behavior to code-of-conduct@atomist.com.

## Documentation

Please see [docs.atomist.com][atomist-doc] for
[developer][atomist-doc-sdm] documentation.

[atomist-doc-sdm]: https://docs.atomist.com/developer/sdm/ (Atomist Documentation - SDM Developer)

## Connect

Follow [@atomist][atomist-twitter] and [The Composition][atomist-blog]
blog related to SDM.

[atomist-twitter]: https://twitter.com/atomist (Atomist on Twitter)
[atomist-blog]: https://the-composition.com/ (The Composition - The Official Atomist Blog)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist-seeds/sdm-pack/issues

## Development

You will need to install [Node.js][node] to build and test this
project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
