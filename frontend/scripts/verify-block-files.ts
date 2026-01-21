/**
 * Verify all blocks have required manufacturing files in R2
 *
 * Usage: pnpm tsx scripts/verify-block-files.ts
 */

interface BlockData {
  slug: string
  name: string
  files?: {
    schematic?: string
    pcb?: string
    step?: string
    gerbers?: string
    thumbnail?: string
  }
  definition?: {
    components?: Array<{
      reference: string
      value: string
      footprint: string
      manufacturer?: string
      mpn?: string
      lcscPartNumber?: string
    }>
  }
  components?: Array<{ ref: string; value: string; package: string }>
}

interface BlocksResponse {
  blocks: BlockData[]
}

async function main() {
  console.log('Fetching blocks from production API...\n')

  const res = await fetch('https://phaestus.app/api/blocks')
  if (!res.ok) {
    console.error(`API error: ${res.status}`)
    process.exit(1)
  }

  const data: BlocksResponse = await res.json()
  const blocks = data.blocks

  console.log(`Found ${blocks.length} blocks\n`)

  // Manufacturing-critical: gerbers + pos file
  const manufacturingRequired = ['gerbers'] as const
  // Enclosure-critical: STEP for 3D model
  const enclosureRequired = ['step'] as const
  // For ordering: LCSC part numbers in components

  const results: Array<{
    slug: string
    name: string
    missingManufacturing: string[]
    missingEnclosure: string[]
    hasPos: boolean
    hasStep: boolean
    hasLcsc: boolean
    componentCount: number
  }> = []

  for (const block of blocks) {
    const missingManufacturing: string[] = []
    const missingEnclosure: string[] = []

    // Check manufacturing-required files (gerbers)
    for (const file of manufacturingRequired) {
      if (!block.files?.[file]) {
        missingManufacturing.push(file)
      }
    }

    // Check enclosure-required files (step)
    for (const file of enclosureRequired) {
      if (!block.files?.[file]) {
        missingEnclosure.push(file)
      }
    }

    // Check if position file exists (by trying to fetch)
    let hasPos = false
    try {
      const posRes = await fetch(
        `https://phaestus.app/api/blocks/${block.slug}/files/${block.slug}-pos.csv`,
        { method: 'HEAD' }
      )
      hasPos = posRes.ok
    } catch {
      hasPos = false
    }

    if (!hasPos) {
      missingManufacturing.push('pos')
    }

    // Check for STEP
    const hasStep = !!block.files?.step

    // Check for LCSC part numbers in components
    const components = block.definition?.components || []
    const hasLcsc = components.some((c) => c.lcscPartNumber)
    const componentCount =
      components.length || (block.components?.length || 0)

    results.push({
      slug: block.slug,
      name: block.name,
      missingManufacturing,
      missingEnclosure,
      hasPos,
      hasStep,
      hasLcsc,
      componentCount,
    })
  }

  // Summary
  console.log('='.repeat(80))
  console.log('BLOCK FILE VERIFICATION RESULTS')
  console.log('='.repeat(80))

  // Manufacturing readiness (gerbers + pos)
  const mfgReady = results.filter((r) => r.missingManufacturing.length === 0)
  const mfgNotReady = results.filter((r) => r.missingManufacturing.length > 0)

  console.log(`\n🏭 MANUFACTURING READINESS (gerbers + pos):`)
  if (mfgReady.length > 0) {
    console.log(`  ✅ READY (${mfgReady.length}/${results.length}):`)
    for (const r of mfgReady) {
      console.log(`     ${r.slug}`)
    }
  }
  if (mfgNotReady.length > 0) {
    console.log(`  ❌ NOT READY (${mfgNotReady.length}/${results.length}):`)
    for (const r of mfgNotReady) {
      console.log(`     ${r.slug.padEnd(35)} missing: ${r.missingManufacturing.join(', ')}`)
    }
  }

  // Enclosure readiness (STEP)
  const hasStep = results.filter((r) => r.hasStep)
  const noStep = results.filter((r) => !r.hasStep)
  console.log(`\n📦 ENCLOSURE READINESS (STEP files):`)
  console.log(`  ✅ Have STEP: ${hasStep.length}/${results.length}`)
  if (noStep.length > 0) {
    console.log(`  ⚠️  Missing STEP: ${noStep.map((r) => r.slug).join(', ')}`)
  }

  // LCSC coverage summary (for ordering)
  const withLcsc = results.filter((r) => r.hasLcsc)
  console.log(`\n🛒 ORDERING READINESS (LCSC part numbers):`)
  console.log(`  ${withLcsc.length}/${results.length} blocks have LCSC part numbers`)
  if (withLcsc.length < results.length) {
    const noLcsc = results.filter((r) => !r.hasLcsc)
    console.log(`  ⚠️  Missing LCSC: ${noLcsc.map((r) => r.slug).join(', ')}`)
  }

  // Component count summary
  console.log(`\n📋 COMPONENT COUNTS:`)
  for (const r of results) {
    console.log(`  ${r.slug.padEnd(35)} ${r.componentCount} components`)
  }

  // Final verdict
  console.log('\n' + '='.repeat(80))
  if (mfgNotReady.length > 0) {
    console.log('❌ CANNOT MANUFACTURE: Some blocks missing gerbers or position files!')
    process.exit(1)
  } else if (noStep.length > 0 || withLcsc.length < results.length) {
    console.log('⚠️  CAN MANUFACTURE GERBERS, but missing:')
    if (noStep.length > 0) console.log(`   - STEP files for enclosure design`)
    if (withLcsc.length < results.length) console.log(`   - LCSC part numbers for component ordering`)
    process.exit(0) // Warning but not blocking for gerber manufacturing
  } else {
    console.log('✅ ALL SYSTEMS GO - Ready to manufacture and order!')
  }
}

main().catch(console.error)
