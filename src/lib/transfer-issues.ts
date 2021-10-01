import type { Client } from "./repository";
import { Repository } from "./repository";

interface TransferIssuesParameters {
  /** An authenticated GitHub API client. */
  client: Client;

  /** The full name of the repo (with owner) which contains issues to transfer. */
  source: string;

  /** The full name of the repo (with owner) to which issues will be transferred. */
  destination: string;

  /** A set of issue numbers indicating the issues to transfer. */
  issueNumbers: Set<number>;
}

export async function transferIssues({
  client,
  source,
  destination,
  issueNumbers,
}: TransferIssuesParameters) {
  // Verify 'source' format, then model the repo.
  if (!source.match(/^[^/]+\/[^/]+$/)) {
    throw new Error(
      `Failed to parse 'source'. 'source' must be in the format 'owner/repo'.`
    );
  }
  const sourceRepo = new Repository(
    client,
    source.match(/^(?<owner>.+)\/(?<repo>.+)$/)!.groups as {
      owner: string;
      repo: string;
    }
  );

  // Verify 'destination' format, then model the repo.
  if (!destination.match(/^[^/]+\/[^/]+$/)) {
    throw new Error(
      `Failed to parse 'destination'. 'destination' must be in the format 'owner/repo'.`
    );
  }
  const destinationRepo = new Repository(
    client,
    destination.match(/^(?<owner>.+)\/(?<repo>.+)$/)!.groups as {
      owner: string;
      repo: string;
    }
  );

  for (const issueNumber of issueNumbers) {
    // Retrieve issue from source repo.
    const sourceIssue = await sourceRepo.getIssue(issueNumber);
    if (!sourceIssue) {
      throw new Error(`Failed to retrieve issue: ${source}#${issueNumber}.`);
    }
    // Copy issue to destination repo.
    const destinationIssue = await destinationRepo.transferIssue(sourceIssue);
    if (destinationIssue?.number !== undefined) {
      console.log(
        `Transferred ${source}#${issueNumber} to ${destination}#${destinationIssue?.number}`
      );
    }
  }
}
