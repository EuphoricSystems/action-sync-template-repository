import {test} from 'tap'
import github from "@actions/github";
import repos from "../lib/repos.js";

test('runner', async () =>{

  github.context = { repo: { owner: 'swimlane', repo: 'swimbundle-template' } }
  const octokit = github.getOctokit('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')

// get dependant repos
  const repositories = await repos(octokit, { dependents: [], additional: [], files: [] })

})
