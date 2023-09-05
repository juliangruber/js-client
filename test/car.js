import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'

import { CarReader, CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'

import { extractVerifiedContent } from '#src/utils/car.js'

async function concatChunks (itr) {
  const arr = []
  for await (const chunk of itr) {
    arr.push(chunk)
  }
  return new Uint8Array(...arr)
}

describe('CAR Verification', () => {
  it('should extract content from a valid CAR', async () => {
    const cidPath =
      'bafkreifjjcie6lypi6ny7amxnfftagclbuxndqonfipmb64f2km2devei4'
    const filepath = './fixtures/hello.car'
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should verify intermediate path segments', async () => {
    const cidPath =
      'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa/subdir/hello.txt'
    const filepath = './fixtures/subdir.car'
    const carStream = fs.createReadStream(filepath)

    const contentItr = await extractVerifiedContent(cidPath, carStream)
    const buffer = await concatChunks(contentItr)
    const actualContent = String.fromCharCode(...buffer)
    const expectedContent = 'hello world\n'

    assert.strictEqual(actualContent, expectedContent)
  })

  it('should error if CAR is missing blocks', async () => {
    const cidPath = 'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa'
    const filepath = './fixtures/subdir.car'
    const carStream = fs.createReadStream(filepath)

    // Create an invalid CAR that only has 1 block but should have 3
    const outCid = CID.parse(cidPath)
    const { writer, out } = await CarWriter.create([outCid]);
    (async () => {
      // need wrapping IIFE to avoid node exiting early
      const reader = await CarReader.fromIterable(carStream)
      await writer.put(await reader.get(cidPath))
      await writer.close()
    })()

    await assert.rejects(
      async () => {
        for await (const _ of extractVerifiedContent(cidPath, out)) {}
      },
      {
        name: 'VerificationError',
        message: 'CAR file has no more blocks.'
      }
    )
  })

  it('should error if CAR blocks are in the wrong traversal order', async () => {
    const cidPath = 'bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa'
    const filepath = './fixtures/subdir.car'
    const carStream = fs.createReadStream(filepath)

    // Create an invalid CAR that has blocks in the wrong order
    const outCid = CID.parse(cidPath)
    const { writer, out } = await CarWriter.create([outCid]);
    (async () => {
      // need wrapping IIFE to avoid node exiting early
      const reader = await CarReader.fromIterable(carStream)

      const blocks = []
      for await (const block of reader.blocks()) {
        blocks.push(block)
      }

      const temp = blocks[0]
      blocks[0] = blocks[1]
      blocks[1] = temp

      for (const block of blocks) {
        await writer.put(block)
      }
      await writer.close()
    })()

    await assert.rejects(
      async () => {
        for await (const _ of extractVerifiedContent(cidPath, out)) {
        }
      },
      {
        name: 'VerificationError',
        message:
          'received block with cid bafybeidhkumeonuwkebh2i4fc7o7lguehauradvlk57gzake6ggjsy372a, expected bafybeigeqgfwhivuuxgmuvcrrwvs4j3yfzgljssvnuqzokm6uby4fpmwsa'
      }
    )
  })
})
