/** Number of issues to retrieve per page. Increasing this from 30 (the default)
 * to 100 (the max) in order to decrease the number of requests.
 * Docs: https://docs.github.com/en/rest/reference/issues#list-repository-issues--parameters
 */
const perPage = 100;
export class Repository {
    #client;
    #labelCache = [];
    #issueCache = [];
    owner;
    repo;
    constructor(client, { owner, repo }) {
        this.#client = client;
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Populate the private label cache. The cache enables checking whether a label
     * already exists, in order to minimize the number of create-label API requests,
     * thereby avoiding rate limiting.
     */
    #populateLabelCache = async () => {
        let pageIndex = 1;
        while (true) {
            const additionalLabels = (await this.#client.rest.issues.listLabelsForRepo({
                owner: this.owner,
                repo: this.repo,
                page: pageIndex++,
                per_page: perPage,
            }))?.data;
            if (!additionalLabels || additionalLabels.length === 0) {
                break;
            }
            else {
                this.#labelCache = this.#labelCache.concat(additionalLabels);
            }
        }
    };
    /**
     * Populate the private issue cache. The cache enables checking whether an issue
     * has already been transferred, in order to avoid creating unwanted duplicates.
     */
    #populateIssueCache = async (source) => {
        let pageIndex = 1;
        while (true) {
            const additionalIssues = (await this.#client.rest.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                labels: `transferred-from: ${source}`,
                page: pageIndex++,
                per_page: perPage,
            }))?.data;
            if (!additionalIssues || additionalIssues.length === 0) {
                break;
            }
            else {
                this.#issueCache = this.#issueCache.concat(additionalIssues);
            }
        }
    };
    /**
     * Create a label, if the label doesn’t already exist. This method is private
     * because it’s not core functionality (this action’s focus is issue transfers)
     * however, label creation is a necessary pre-requisite for issue transfers.
     */
    #createLabel = async (label) => {
        // Return early if the label already exists.
        if (this.#labelCache.length === 0) {
            await this.#populateLabelCache();
        }
        const duplicateLabel = this.#labelCache.find(({ name }) => name === label.name);
        if (duplicateLabel) {
            console.log(`Skipping label creation. Label source (${label.name}) already exists at destination (${duplicateLabel.name}).`);
            return;
        }
        await this.#client.rest.issues.createLabel({
            owner: this.owner,
            repo: this.repo,
            name: label.name,
            description: label.description || undefined,
            color: label.color || undefined,
        });
    };
    /**
     * Fetch the issue with the given issue number. This method is used to obtain
     * the issue in the source repository ahead of an issue transfer.
     */
    getIssue = async (issueNumber) => {
        return (await this.#client.rest.issues.get({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
        }))?.data;
    };
    /**
     * Create a new issue with the same attributes as the provided issue.
     * This method is used to copy an issue to the destination repository.
     */
    transferIssue = async (issue) => {
        const { source } = issue.repository_url.match(/^(?<_>.+)\/(?<source>.+\/.+)$/).groups;
        // Return early if the issue has already been transferred.
        if (this.#issueCache.length === 0) {
            await this.#populateIssueCache(source);
        }
        const duplicateIssue = this.#issueCache.find(({ title }) => title === issue.title);
        if (duplicateIssue) {
            console.log(`Skipping issue transfer. Issue source (${source}#${issue.number}) already exists at destination (${this.owner}/${this.repo}#${duplicateIssue.number}).`);
            return;
        }
        // Only labels which exist can be added to issues, so create missing labels in the destination repo.
        for (const _label of issue.labels) {
            let label = _label;
            if (typeof _label === "string") {
                label = {
                    name: _label,
                };
            }
            await this.#createLabel(label);
        }
        const transferredFromLabel = {
            name: `transferred-from: ${source}`.substring(0, 50),
        };
        await this.#createLabel(transferredFromLabel);
        return (await this.#client.rest.issues.create({
            owner: this.owner,
            repo: this.repo,
            title: issue.title,
            body: issue.body || "",
            labels: [...issue.labels, transferredFromLabel],
            assignee: issue.assignee?.login,
            assignees: issue.assignees?.reduce((assignees, assignee) => {
                const login = assignee?.login;
                if (login) {
                    assignees = (assignees || []).concat(login);
                }
                return assignees;
            }, undefined),
        }))?.data;
    };
}
