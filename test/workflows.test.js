import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../workflows/', import.meta.url);
const workflows = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir))));
const byId = Object.fromEntries(workflows.map((w) => [w.id, w]));

test('the agent prompt contains the current clinic info (run npm run sync)', () => {
  const agent = byId.BsLeadAgent00001.nodes.find((n) => n.name === 'AI Agent');
  const knowledge = readFileSync(new URL('../knowledge/clinic.md', import.meta.url), 'utf8').trim();
  assert.ok(agent.parameters.options.systemMessage.includes(knowledge));
});

test('every sub-workflow a node calls is in the repo', () => {
  for (const wf of workflows) {
    for (const n of wf.nodes.filter((n) => n.parameters.workflowId)) {
      assert.ok(byId[n.parameters.workflowId.value], `${wf.name} → ${n.name} calls a missing workflow`);
    }
  }
});

test('connections only reference nodes that exist', () => {
  for (const wf of workflows) {
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [from, outputs] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), `${wf.name}: unknown source ${from}`);
      for (const links of Object.values(outputs).flat()) {
        for (const { node } of links) assert.ok(names.has(node), `${wf.name}: unknown target ${node}`);
      }
    }
  }
});

test('tool inputs match the sub-workflow trigger inputs', () => {
  for (const wf of workflows) {
    for (const n of wf.nodes.filter((n) => n.parameters.workflowId)) {
      const sub = byId[n.parameters.workflowId.value];
      const trigger = sub.nodes.find((x) => x.type === 'n8n-nodes-base.executeWorkflowTrigger');
      const expected = trigger.parameters.workflowInputs.values.map((v) => v.name).sort();
      assert.deepEqual(Object.keys(n.parameters.workflowInputs.value).sort(), expected, `${wf.name} → ${n.name}`);
    }
  }
});
