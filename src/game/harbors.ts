import { getWaterHexPositions, hexToPixel, HEX_R } from './board'
import { buildTopology } from './topology'
import type { Hex, Harbor, EdgeId, VertexId, HarborType, Terrain } from './types'

const RESOURCE_TYPES: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

/**
 * Creates harbors on coastal edges.
 * Harbors are placed on edges that border water hexes and connect to land vertices.
 * Each harbor connects to exactly 2 vertices.
 */
export function createHarbors(hexes: Hex[]): Harbor[] {
  const waterPositions = getWaterHexPositions()
  const waterHexSet = new Set(waterPositions.map(([q, r]) => `${q},${r}`))
  const landHexIds = new Set(hexes.map(h => h.id))
  
  const { vertices, edges } = buildTopology(hexes)
  
  // Helper: check if a vertex position is adjacent to a water hex
  // A vertex is coastal if it touches fewer than 3 land hexes
  // (coastal vertices typically touch 1-2 land hexes and 1-2 water hexes)
  // In Catan, vertices can touch up to 3 hexes. Coastal vertices touch 1-2 land hexes.
  const isVertexOnCoast = (v: { hexIds: string[] }): boolean => {
    const landHexCount = v.hexIds.filter(hid => landHexIds.has(hid)).length
    // Coastal vertices touch 1-2 land hexes (the third would be water)
    // We require at least 1 land hex to ensure it's part of the playable board
    return landHexCount >= 1 && landHexCount <= 2
  }
  
  console.log('Total vertices:', vertices.length)
  console.log('Total edges:', edges.length)
  const coastalVertices = vertices.filter(isVertexOnCoast)
  console.log('Coastal vertices:', coastalVertices.length)
  
  // Find coastal edges: edges where both vertices are on the coast
  const coastalEdges: Array<{ edgeId: EdgeId; v1: VertexId; v2: VertexId; hexIds: string[] }> = []
  
  for (const e of edges) {
    const v1 = vertices.find(v => v.id === e.v1)
    const v2 = vertices.find(v => v.id === e.v2)
    if (!v1 || !v2) continue
    
    // Both vertices must be coastal (touch water)
    if (isVertexOnCoast(v1) && isVertexOnCoast(v2)) {
      coastalEdges.push({
        edgeId: e.id,
        v1: e.v1,
        v2: e.v2,
        hexIds: e.hexIds,
      })
    }
  }
  
  const trueCoastalEdges = coastalEdges
  
  // Space out harbors: don't place them on adjacent edges
  // We'll use a simple approach: take every 3rd edge or so, ensuring spacing
  const harbors: Harbor[] = []
  const usedVertices = new Set<VertexId>()
  const usedEdges = new Set<EdgeId>()
  
  // Create harbor types: 4 generic (3:1), 5 specific (2:1) - one for each resource
  const harborTypes: HarborType[] = [
    'generic', 'generic', 'generic', 'generic',
    ...RESOURCE_TYPES, // One 2:1 harbor for each resource type
  ]
  
  // Shuffle and assign types
  const shuffledTypes = [...harborTypes]
  for (let i = shuffledTypes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTypes[i], shuffledTypes[j]] = [shuffledTypes[j], shuffledTypes[i]]
  }
  
  let typeIndex = 0
  
  console.log('Coastal edges found:', trueCoastalEdges.length)
  
  // Calculate board center for angle calculations
  const boardCenter = { x: 0, y: 0 } // Approximate center (0,0) since hexes are centered around origin
  
  // Calculate angles for each coastal edge to distribute them evenly around the board
  const edgesWithAngles = trueCoastalEdges.map(edge => {
    const v1 = vertices.find(v => v.id === edge.v1)!
    const v2 = vertices.find(v => v.id === edge.v2)!
    const midX = (v1.x + v2.x) / 2
    const midY = (v1.y + v2.y) / 2
    
    // Calculate angle from board center to edge midpoint
    const angle = Math.atan2(midY - boardCenter.y, midX - boardCenter.x)
    return { edge, angle, midX, midY }
  })
  
  // Sort edges by angle to process them in order around the board
  edgesWithAngles.sort((a, b) => a.angle - b.angle)
  
  // Divide into sectors for even distribution (9 harbors total)
  const numHarbors = shuffledTypes.length
  const sectorSize = (2 * Math.PI) / numHarbors
  
  // Place harbors ensuring even distribution across sectors
  for (let i = 0; i < numHarbors && harbors.length < numHarbors; i++) {
    // Target angle for this sector
    const targetAngle = i * sectorSize - Math.PI // Start from -π to get better distribution
    
    // Find the edge closest to this target angle that doesn't conflict
    let bestEdge: typeof edgesWithAngles[0] | null = null
    let bestAngleDiff = Infinity
    
    for (const edgeData of edgesWithAngles) {
      const { edge } = edgeData
      
      // Skip if already used
      if (usedVertices.has(edge.v1) || usedVertices.has(edge.v2)) continue
      if (usedEdges.has(edge.edgeId)) continue
      
      // Calculate angle difference (handle wrap-around)
      let angleDiff = Math.abs(edgeData.angle - targetAngle)
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
      
      // Check minimum distance from existing harbors
      let tooClose = false
      for (const existingHarbor of harbors) {
        const existingEdge = edges.find(e => e.id === existingHarbor.edgeId)
        if (!existingEdge) continue
        const existingV1 = vertices.find(v => v.id === existingEdge.v1)!
        const existingV2 = vertices.find(v => v.id === existingEdge.v2)!
        const existingMidX = (existingV1.x + existingV2.x) / 2
        const existingMidY = (existingV1.y + existingV2.y) / 2
        
        const dist = Math.sqrt(
          Math.pow(edgeData.midX - existingMidX, 2) + 
          Math.pow(edgeData.midY - existingMidY, 2)
        )
        // Require minimum distance of ~1.5 hex radii
        if (dist < HEX_R * 1.5) {
          tooClose = true
          break
        }
      }
      
      if (tooClose) continue
      
      // Track the best edge for this sector
      if (angleDiff < bestAngleDiff) {
        bestAngleDiff = angleDiff
        bestEdge = edgeData
      }
    }
    
    // Place the best edge found for this sector
    if (bestEdge) {
      const harbor: Harbor = {
        id: `harbor-${harbors.length}`,
        edgeId: bestEdge.edge.edgeId,
        vertexIds: [bestEdge.edge.v1, bestEdge.edge.v2],
        type: shuffledTypes[typeIndex++],
      }
      
      harbors.push(harbor)
      usedVertices.add(bestEdge.edge.v1)
      usedVertices.add(bestEdge.edge.v2)
      usedEdges.add(bestEdge.edge.edgeId)
    }
  }
  
  // If we didn't place all harbors, fill remaining slots with any available edges
  if (harbors.length < shuffledTypes.length) {
    for (const edgeData of edgesWithAngles) {
      const { edge } = edgeData
      if (usedVertices.has(edge.v1) || usedVertices.has(edge.v2)) continue
      if (usedEdges.has(edge.edgeId)) continue
      if (typeIndex >= shuffledTypes.length) break
      
      const harbor: Harbor = {
        id: `harbor-${harbors.length}`,
        edgeId: edge.edgeId,
        vertexIds: [edge.v1, edge.v2],
        type: shuffledTypes[typeIndex++],
      }
      
      harbors.push(harbor)
      usedVertices.add(edge.v1)
      usedVertices.add(edge.v2)
      usedEdges.add(edge.edgeId)
    }
  }
  
  console.log('Harbors placed:', harbors.length)
  return harbors
}
