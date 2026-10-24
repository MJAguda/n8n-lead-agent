// Runs the JavaScript of an n8n Code node straight from the exported workflow JSON,
// so the workflow file stays the single source of truth for the business rules.
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';

const wrap = (items) => ({
  all: () => items,
  first: () => items[0],
  item: items[0],
});

/**
 * @param {string} workflow  file name in workflows/
 * @param {string} nodeName  Code node name
 * @param {object[]} input   json payloads of the incoming items
 * @param {object} [nodes]   outputs of earlier nodes for $('Node name'): { name: [json, ...] }
 * @returns {object[]} json payloads the node returned
 */
export function runCode(workflow, nodeName, input, nodes = {}) {
  const wf = JSON.parse(readFileSync(new URL(`../workflows/${workflow}`, import.meta.url)));
  const node = wf.nodes.find((n) => n.name === nodeName);
  if (!node) throw new Error(`No node "${nodeName}" in ${workflow}`);

  const toItems = (list) => list.map((json) => ({ json }));
  const $input = wrap(toItems(input));
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Test did not provide output for node "${name}"`);
    return wrap(toItems(nodes[name]));
  };

  const fn = new Function('$input', '$', 'DateTime', node.parameters.jsCode);
  return fn($input, $, DateTime).map((item) => item.json);
}
