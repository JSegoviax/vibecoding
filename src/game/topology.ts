import { hexToPixel, hexCorner, HEX_R } from './board'
import type { Hex, VertexId, EdgeId } from './types'

function posKey(x: number, y: number): string {
  return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
}

export interface VertexData {
  id: VertexId
  hexIds: string[]
  x: number
  y: number
}

export interface EdgeData {
  id: EdgeId
  v1: VertexId
  v2: VertexId
  hexIds: string[]
}

export function buildTopology(hexes: Hex[]): { vertices: VertexData[]; edges: EdgeData[] } {
  const posToVertex = new Map<string, VertexData>()
  const vertexList: VertexData[] = []
  const edgeSet = new Map<string, EdgeData>()

  for (const h of hexes) {
    const center = hexToPixel(h.q, h.r)
    for (let c = 0; c < 6; c++) {
      const pt = hexCorner(center, c)
      const key = posKey(pt.x, pt.y)
      let v = posToVertex.get(key)
      if (!v) {
        v = { id: `v${key}`, hexIds: [], x: pt.x, y: pt.y }
        posToVertex.set(key, v)
        vertexList.push(v)
      }
      if (!v.hexIds.includes(h.id)) v.hexIds.push(h.id)
    }
  }

  for (let i = 0; i < vertexList.length; i++) {
    vertexList[i].id = `v${i}`
  }

  for (const h of hexes) {
    const center = hexToPixel(h.q, h.r)
    for (let c = 0; c < 6; c++) {
      const pt1 = hexCorner(center, c)
      const pt2 = hexCorner(center, (c + 1) % 6)
      const k1 = posKey(pt1.x, pt1.y)
      const k2 = posKey(pt2.x, pt2.y)
      const id1 = vertexList.find(v => posKey(v.x, v.y) === k1)?.id
      const id2 = vertexList.find(v => posKey(v.x, v.y) === k2)?.id
      if (!id1 || !id2) continue
      const eid = [id1, id2].sort().join('|')
      if (edgeSet.has(eid)) {
        edgeSet.get(eid)!.hexIds.push(h.id)
      } else {
        const v1 = vertexList.find(x => x.id === id1)!
        const v2 = vertexList.find(x => x.id === id2)!
        edgeSet.set(eid, { id: `e${eid}`, v1: id1, v2: id2, hexIds: [h.id] })
      }
    }
  }

  return { vertices: vertexList, edges: Array.from(edgeSet.values()) }
}

export function getVerticesForHex(hexId: string, vertices: VertexData[]): VertexData[] {
  return vertices.filter(v => v.hexIds.includes(hexId))
}

export function getEdgesForHex(hexId: string, edges: EdgeData[]): EdgeData[] {
  return edges.filter(e => e.hexIds.includes(hexId))
}
