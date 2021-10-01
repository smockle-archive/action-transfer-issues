import { Repository } from "./repository";
export async function transferIssues({ client, source, destination, issueNumbers, }) {
    // Verify 'source' format, then model the repo.
    if (!source.match(/^[^/]+\/[^/]+$/)) {
        throw new Error(`Failed to parse 'source'. 'source' must be in the format 'owner/repo'.`);
    }
    const sourceRepo = new Repository(client, source.match(/^(?<owner>.+)\/(?<repo>.+)$/).groups);
    // Verify 'destination' format, then model the repo.
    if (!destination.match(/^[^/]+\/[^/]+$/)) {
        throw new Error(`Failed to parse 'destination'. 'destination' must be in the format 'owner/repo'.`);
    }
    const destinationRepo = new Repository(client, destination.match(/^(?<owner>.+)\/(?<repo>.+)$/).groups);
    for (const issueNumber of issueNumbers) {
        // Retrieve issue from source repo.
        const sourceIssue = await sourceRepo.getIssue(issueNumber);
        if (!sourceIssue) {
            throw new Error(`Failed to retrieve issue: ${source}#${issueNumber}.`);
        }
        // Copy issue to destination repo.
        const destinationIssue = await destinationRepo.transferIssue(sourceIssue);
        console.log(`Transferred ${source}#${issueNumber} to ${destination}#${destinationIssue?.number}`);
    }
}
