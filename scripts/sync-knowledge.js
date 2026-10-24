// Copies knowledge/clinic.md into the agent's system prompt in workflows/lead-agent.json.
// Run after editing the clinic info, then re-import the workflow: npm run sync
import { readFileSync, writeFileSync } from 'node:fs';

const workflowFile = new URL('../workflows/lead-agent.json', import.meta.url);
const knowledge = readFileSync(new URL('../knowledge/clinic.md', import.meta.url), 'utf8').trim();

if (knowledge.includes('{{')) throw new Error('clinic.md must not contain "{{", n8n would read it as an expression');

const workflow = JSON.parse(readFileSync(workflowFile, 'utf8'));
const agent = workflow.nodes.find((n) => n.name === 'AI Agent');
const prompt = agent.parameters.options.systemMessage;
const pattern = /(<!-- knowledge:start -->)[\s\S]*(<!-- knowledge:end -->)/;
if (!pattern.test(prompt)) throw new Error('Knowledge markers missing from the AI Agent system message');

agent.parameters.options.systemMessage = prompt.replace(pattern, (_, start, end) => `${start}\n${knowledge}\n${end}`);
writeFileSync(workflowFile, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Synced ${knowledge.length} characters of clinic info into lead-agent.json`);
