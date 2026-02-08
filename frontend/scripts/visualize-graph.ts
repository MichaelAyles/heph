/**
 * Visualize the PHAESTUS LangGraph
 *
 * Usage: pnpm tsx scripts/visualize-graph.ts
 *
 * Outputs:
 * - graph.png - PNG image of the graph
 * - Mermaid code printed to console
 */

import * as fs from 'node:fs/promises'
import { compiledGraph } from '../src/services/langgraph'

async function main() {
  console.log('Getting graph visualization...\n')

  const drawableGraph = await compiledGraph.getGraphAsync()

  // Output Mermaid code
  const mermaidCode = drawableGraph.drawMermaid()
  console.log('Mermaid diagram:\n')
  console.log('```mermaid')
  console.log(mermaidCode)
  console.log('```\n')

  // Save as PNG
  try {
    const image = await drawableGraph.drawMermaidPng()
    const imageBuffer = new Uint8Array(await image.arrayBuffer())
    await fs.writeFile('graph.png', imageBuffer)
    console.log('PNG saved to: graph.png')
  } catch {
    console.log('Note: PNG generation requires network access to mermaid.ink')
    console.log('You can paste the Mermaid code above into https://mermaid.live')
  }
}

main().catch(console.error)
