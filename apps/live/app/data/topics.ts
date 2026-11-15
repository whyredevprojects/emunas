/**
 * Helpers over the topic tree file (`/data/topics.json`, C1.7). Browser-safe.
 */
import type { FacetLabel, TopicNode, TopicRow, TopicsFile } from "./types.ts";

/** The label of a tree row (`he` only when it differs from the Yiddish form). */
export function topicRowLabel(row: TopicRow): FacetLabel {
  const [, , en, yi, he] = row;
  return he === null ? { en, yi } : { en, yi, he };
}

/**
 * The tree rows as nodes, in file order, with each node's level (1 for a root). A parent that is not
 * in the file makes the node a root.
 */
export function topicNodes(file: Pick<TopicsFile, "topics">): TopicNode[] {
  const level = new Map<string, number>();
  const ids = new Set(file.topics.map((r) => r[0]));
  return file.topics.map((row) => {
    const [id, parent, , , , count] = row;
    const parentId = parent !== null && ids.has(parent) ? parent : null;
    const l = parentId === null ? 1 : (level.get(parentId) ?? 1) + 1;
    level.set(id, l);
    return { id, parentId, level: l, label: topicRowLabel(row), count };
  });
}
