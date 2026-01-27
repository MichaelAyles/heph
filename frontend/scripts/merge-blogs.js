import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const blogsDir = join(import.meta.dirname, '../public/blogs')
const outputFile = join(import.meta.dirname, '../output.txt')

async function mergeBogs() {
  const entries = await readdir(blogsDir, { withFileTypes: true })
  const blogDirs = entries
    .filter(e => e.isDirectory() && e.name.startsWith('blog'))
    .map(e => e.name)
    .sort((a, b) => {
      const numA = parseInt(a.replace('blog', ''))
      const numB = parseInt(b.replace('blog', ''))
      return numA - numB
    })

  let output = ''
  for (const dir of blogDirs) {
    const blogPath = join(blogsDir, dir, 'blog.md')
    try {
      const content = await readFile(blogPath, 'utf-8')
      output += `\n\n${'='.repeat(80)}\n`
      output += `${dir.toUpperCase()}\n`
      output += `${'='.repeat(80)}\n\n`
      output += content
    } catch (err) {
      console.log(`Skipping ${dir}: ${err.message}`)
    }
  }

  await writeFile(outputFile, output.trim())
  console.log(`Merged ${blogDirs.length} blogs into output.txt`)
}

mergeBogs()
