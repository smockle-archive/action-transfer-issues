#!/usr/bin/env node --es-module-specifier-resolution=node
import core from "@actions/core";
import github from "@actions/github";
import { transferIssues } from "./lib/transfer-issues";
(async () => {
    try {
        // Retrieve GitHub token from environment.
        /** A [GitHub token](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `public_repo` (for use in public repos) or `repo` (for use in private repos) scope. */
        const token = process.env.GH_TOKEN;
        if (!token) {
            throw new Error("Failed to retrieve a GitHub token. Does this repository have a secret named 'GH_TOKEN'? https://docs.github.com/en/actions/reference/encrypted-secrets#creating-encrypted-secrets-for-a-repository");
        }
        // Retrieve 'source' from 'inputs'.
        /** The full name of the repo (with owner) which contains issues to transfer. */
        const source = core.getInput("source", {
            required: true,
        });
        if (!source) {
            throw new Error(`Failed to retrieve 'source'.`);
        }
        // Retrieve 'destination' from 'inputs'.
        /** The full name of the repo (with owner) to which issues will be transferred. */
        const destination = core.getInput("destination", {
            required: true,
        });
        if (!destination) {
            throw new Error(`Failed to retrieve 'destination'.`);
        }
        // Retrieve 'issue_numbers' from 'inputs'.
        /** A set of issue numbers indicating the issues to transfer. */
        let issueNumbers = new Set();
        if (typeof core.getInput("issue_numbers") === "string" &&
            core.getInput("issue_numbers") !== "") {
            for (const issueNumber of core.getInput("issue_numbers").split(" ")) {
                if (!Number.isNaN(Number(issueNumber))) {
                    issueNumbers.add(Number(issueNumber));
                }
            }
        }
        if (issueNumbers.size === 0) {
            throw new Error(`Failed to retrieve 'issue_numbers'.`);
        }
        // Retrieve an authenticated client
        const client = github.getOctokit(token);
        // Transfer specified issues
        await transferIssues({
            client,
            source,
            destination,
            issueNumbers,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : `A top-level error occurred: ${error}`;
        core.setFailed(errorMessage);
    }
})();