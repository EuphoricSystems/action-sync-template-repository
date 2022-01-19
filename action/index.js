// node modules
import { inspect } from 'util'

// packages
import core from '@actions/core'
import github from '@actions/github'
import {throttling} from "@octokit/plugin-throttling";
import {Octokit} from "@octokit/core";

// modules
import config from './lib/config.js'
import files from './lib/files.js'
import pull_request from './lib/pull_request.js'
import push from './lib/push.js'
import repos from './lib/repos.js'
import scan from './lib/scan.js'


const workspace = process.env.GITHUB_WORKSPACE || '/github/workspace'

const allowed = [
  'schedule',
  'workflow_dispatch',
  'repository_dispatch',
  'pull_request',
  'pull_request_target',
  'release',
  'workflow_run',
  'push'
]

const allowedStrategy = [
  'pull_request',
  'push'
]

// parse inputs
const inputs = {
  token: core.getInput('github-token', { required: true }),
  config: core.getInput('config', { required: false }),
  dry: core.getInput('dry-run', { required: false }) === 'true',
  updateStrategy: core.getInput('update-strategy', {required: true})
}

// error handler
function errorHandler (error) {
  core.setFailed(`${error.message}`)
  core.debug(inspect(error))
  process.exit(1)
}

// catch errors and exit
process.on('unhandledRejection', errorHandler)
process.on('uncaughtException', errorHandler)

// dry run
if (inputs.dry) {
  core.info('running in dry-run mode')
}

// exit early: incompatible workflow
if (!allowed.includes(github.context.eventName)) {
  core.warning(`action ran on incompatible event "${github.context.eventName}", only "${allowed.join('", "')}" are allowed`)
  process.exit(0)
}

if (!allowedStrategy.includes(inputs.updateStrategy)) {
  core.warning(`incompatible updated strategy "${inputs.updateStrategy}", only "${allowedStrategy.join('", "')}" are allowed`)
  process.exit(0)
}

// load config
const options = config({ workspace, path: inputs.config })
const throttledOctokit = Octokit.plugin(throttling)
// init octokit
const octokit = new throttledOctokit({
  auth: inputs.token,
  throttle:  {
    onRateLimit: (retryAfter, options) => {
      core.warning(
        `Request quota exhausted for request ${options.method} ${options.url}`
      );

      if (options.request.retryCount === 3) {
        // only retries once
        core.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onAbuseLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      core.warning(
        `Abuse detected for request ${options.method} ${options.url}`
      );
    },
  }
})

// get dependant repos
const repositories = await repos(octokit, options)

// exit early: no repos to update
if (repositories.length === 0) {
  core.info('no repositories to update')
  process.exit(0)
}

// load files
const localFiles = await files(workspace, options)

// scan repos
const changedRepositories = await scan(octokit, { repositories, localFiles })

// determine which method to run
const method = inputs.updateStrategy === 'pull_request' ? pull_request : push

await method(octokit, { changedRepositories, localFiles, inputs })
