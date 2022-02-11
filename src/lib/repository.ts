import type { getOctokit } from "@actions/github";
export type Client = ReturnType<typeof getOctokit>;
type Unwrapped<T> = T extends Promise<infer U>
  ? U
  : T extends (infer U)[]
  ? U
  : never;
type Issue = Unwrapped<ReturnType<Client["rest"]["issues"]["get"]>>["data"];
type Label = Exclude<Unwrapped<Issue["labels"]>, string>;

/** https://docs.github.com/en/graphql/reference/mutations#transferissue */
type TransferIssueReturnFields = {
  clientMutationId: string,
  issue: Pick<Issue, "id" | "number" | "url" | "state" | "title" | "labels" | "locked">
}

interface StrictLabel extends Label {
  name: string
}
/**
 * Type guard for named object labels. `issues.get`, `issues.create`,
 * and `issues.addLabels` have divering label types; this guard normalizes the type.
 * @param label Any valid label type (e.g. named object, unnamed object, string).
 * @returns Label is a named object.
 */
function isStrictLabel(label: string | Label): label is StrictLabel {
  return label !== null && typeof label === "object" && label.hasOwnProperty("name") && typeof label.name === "string" && label.name.length > 0;
}

/** Repository visibility. */
enum Visibility {
  Public,
  Private
}

/** Number of issues to retrieve per page. Increasing this from 30 (the default)
 * to 100 (the max) in order to decrease the number of requests.
 * Docs: https://docs.github.com/en/rest/reference/issues#list-repository-issues--parameters
 */
const perPage = 100;

export class Repository {
  #client: Client;
  #labelCache: Label[] = [];
  #issueCache: Issue[] = [];
  owner: string;
  repo: string;
  visibility: Visibility | undefined;

  constructor(
    client: Client,
    { owner, repo }: { owner: string; repo: string }
  ) {
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
      const additionalLabels: Label[] = (
        await this.#client.rest.issues.listLabelsForRepo({
          owner: this.owner,
          repo: this.repo,
          page: pageIndex++,
          per_page: perPage,
        })
      )?.data;
      if (!additionalLabels || additionalLabels.length === 0) {
        break;
      } else {
        this.#labelCache = this.#labelCache.concat(additionalLabels);
      }
    }
  };

  /**
   * Populate the private issue cache. The cache enables checking whether an issue
   * has already been transferred, in order to avoid creating unwanted duplicates.
   */
  #populateIssueCache = async (source: string) => {
    let pageIndex = 1;
    while (true) {
      const additionalIssues: Issue[] = (
        await this.#client.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          labels: `transferred-from: ${source}`.substring(0, 50),
          page: pageIndex++,
          per_page: perPage,
        })
      )?.data;
      if (!additionalIssues || additionalIssues.length === 0) {
        break;
      } else {
        this.#issueCache = this.#issueCache.concat(additionalIssues);
      }
    }
  };

  /**
   * Populate the repository’s visibility. If visibility cannot be determined,
   * assume the repo is private. Private repos have stricter pre-transfer checks,
   * i.e. the copy operation is more likely to be used, and since the copy
   * operation has fewer failure modes, it’s safer to assume repos are private.
   */
  #populateVisibility = async () => {
    const data = (await this.#client.rest.repos.get({
      owner: this.owner,
      repo: this.repo
    }))?.data
    this.visibility = data.private === false ? Visibility.Public : Visibility.Private
  }

  /**
   * Create a label, if the label doesn’t already exist. This method is private
   * because it’s not core functionality (this action’s focus is issue transfers)
   * however, label creation is a necessary pre-requisite for issue transfers.
   */
  #createLabel = async (label: Label): Promise<Label | undefined> => {
    // Return early if the label already exists.
    if (this.#labelCache.length === 0) {
      await this.#populateLabelCache();
    }
    const duplicateLabel = this.#labelCache.find(
      ({ name }) => name === label.name
    );
    if (duplicateLabel) {
      // console.log(
      //   `Skipping label creation. Label source (${label.name}) already exists at destination (${duplicateLabel.name}).`
      // );
      return;
    }
    console.log(`Creating label: ${label.name}`);
    const newLabel: Label = (
      await this.#client.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name: label.name!,
        description: label.description || undefined,
        color: label.color || undefined,
      })
    )?.data;
    this.#labelCache = this.#labelCache.concat(newLabel);
    return newLabel;
  };

  /**
   * Fetch the issue with the given issue number. This method is used to obtain
   * the issue in the source repository ahead of an issue transfer.
   */
  getIssue = async (issueNumber: number) => {
    return (
      await this.#client.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      })
    )?.data;
  };

  /**
   * Create a new issue with the same attributes as the provided issue.
   * This method is used to transfer or copy an issue to the destination repository.
   */
  transferIssue = async (issue: Issue): Promise<Issue | TransferIssueReturnFields["issue"] | undefined> => {
    const {sourceOwner, sourceRepo} = issue.repository_url.match(
      /^(?<_>.+)\/(?<sourceOwner>.+)\/(?<sourceRepo>.+)$/
    )!.groups as { sourceOwner: string, sourceRepo: string };
    const source = new Repository(this.#client, { owner: sourceOwner, repo: sourceRepo })

    // Return early if the issue has already been transferred.
    if (this.#issueCache.length === 0) {
      await this.#populateIssueCache(`${source.owner}/${source.repo}`);
    }
    const duplicateIssue = this.#issueCache.find(
      ({ title }) => title === issue.title
    );
    if (duplicateIssue) {
      console.log(
        `Skipping issue transfer. Issue source (${source.owner}/${source.repo}#${issue.number}) already exists at destination (${this.owner}/${this.repo}#${duplicateIssue.number}).`
      );
      return;
    }

    // Only labels which exist can be added to issues, so create missing labels in the destination repo.
    const transferredFromLabel: StrictLabel = {
      name: `transferred-from: ${source.owner}/${source.repo}`.substring(0, 50)
    };
    const labels = issue.labels.reduce<StrictLabel[]>((labels, label) => {
      if (isStrictLabel(label)) {
        labels.push(label)
      } else if (typeof label === "string") {
        labels.push({ name: label })
      }
      return labels
    }, [transferredFromLabel])
    for (const label of labels) {
      await this.#createLabel(label as Label);
    }

    /** Whether this is an intra-org operation. */
    const canTransferBetweenOrgs = source.owner.toLowerCase() === this.owner.toLowerCase();

    // Set the source repository’s `visibility` attribute.
    await source.#populateVisibility();
    if (typeof this.visibility === "undefined") {
      await this.#populateVisibility();
    }
    /** Whether this is a public-to-public, public-to-private, or private-to-private operation. */
    const canTransferBetweenVisibilities = source.visibility === Visibility.Public || (source.visibility === Visibility.Private && this.visibility === Visibility.Private);

    if (canTransferBetweenOrgs && canTransferBetweenVisibilities) {
      // Transfer operation is allowed.
      const sourceIssueId = (await this.#client.graphql<{ id: string }>(`query {
        repository(owner: ${source.owner}, name: ${source.repo}) {
          issue(number: ${issue.number}) {
            id
          }
        }
      }`))?.id
      const destinationRepoId = (await this.#client.graphql<{ id: string }>(`query {
        repository(owner: ${this.owner}, name: ${this.repo}) {
          id
        }
      }`))?.id
      const transferredIssue = (await this.#client.graphql<TransferIssueReturnFields>(`mutation {
        transferIssue(
          input: {
            issueId: ${sourceIssueId}
            repositoryId: ${destinationRepoId}
          }
        ) {
          issue {
            id
            number
            url
            state
            title
            labels(first: 100) {
              nodes {
                name
              }
            }
            locked
          }
        }
      }`))?.issue
      // https://docs.github.com/en/issues/tracking-your-work-with-issues/transferring-an-issue-to-another-repository notes that:
      // “The issue's labels…are not retained.” As a workaround, re-add them.
      transferredIssue.labels = (await this.#client.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: transferredIssue.number,
        labels: labels.map(({ name }) => name)
      }))?.data
      return transferredIssue
    } else {
      // Transfer operation is disallowed. Falling back to copy operation.
      return (await this.#client.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: issue.title,
        body: issue.body || "",
        labels,
        assignee: !issue.assignees ? issue.assignee?.login : undefined,
        assignees: issue.assignees?.reduce(
          (assignees: string[] | undefined, assignee) => {
            const login = assignee?.login;
            if (login) {
              assignees = (assignees || []).concat(login);
            }
            return assignees;
          },
          undefined
        ),
      }))?.data
    }
  };
}
