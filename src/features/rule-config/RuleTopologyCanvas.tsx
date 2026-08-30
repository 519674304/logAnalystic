import { useMemo } from 'react'
import type * as React from 'react'
import type { RulePackageVersionDto } from '../../api/dto'
import { buildRuleTopologyViewModel } from '../../view-model/rule-topology-view-model'
import type {
  RuleTopologyFlowViewModel,
  RuleTopologyNode,
  RuleTopologyStageViewModel,
} from '../../view-model/rule-topology-view-model'

const NODE_WIDTH = 200
const HEADER_H = 46
const STAGE_H = 24
const STAGE_GAP = 3
const STAGE_PAD = 6
const LAYER_GAP = 64
const NODE_GAP_X = 40
const FLOW_HEADER_H = 30
const FLOW_GAP = 48
const PADDING = 28

// 应用配色：填充 / 描边 / 文字，与 index.css 的 Tailwind 风格浅色板一致。
const APP_COLORS: Array<[string, string, string]> = [
  ['#dbeafe', '#93c5fd', '#1e3a5f'],
  ['#dcfce7', '#86efac', '#14532d'],
  ['#fef3c7', '#fcd34d', '#713f12'],
  ['#ede9fe', '#c4b5fd', '#4c1d95'],
  ['#fce7f3', '#f9a8d4', '#831843'],
  ['#cffafe', '#67e8f9', '#164e63'],
  ['#ffedd5', '#fdba74', '#7c2d12'],
  ['#e2e8f0', '#cbd5e1', '#334155'],
]

const EDGE_FORK = '#2563eb'
const EDGE_JOIN = '#7c3aed'
const EDGE_RPC = '#d97706'

export type TopologyLocateTarget = { nodeType: string; nodeId: string }

type RuleTopologyCanvasProps = {
  activeVersion: RulePackageVersionDto
  selectedScenarioId: string | null
  onSelectNode: (target: TopologyLocateTarget) => void
  onEditNode: (target: TopologyLocateTarget) => void
}

interface NodePos {
  x: number
  y: number
  height: number
}

interface FlowLayout {
  nodePos: Map<string, NodePos>
  width: number
  height: number
}

function appColorIndex(appId: string, applications: Array<{ id: string; name: string }>): number {
  const index = applications.findIndex((app) => app.id === appId)
  return index >= 0 ? index % APP_COLORS.length : APP_COLORS.length - 1
}

function appColor(appId: string, applications: Array<{ id: string; name: string }>): [string, string, string] {
  return APP_COLORS[appColorIndex(appId, applications)]
}

function nodeHeight(stages: RuleTopologyStageViewModel[]) {
  if (stages.length === 0) return HEADER_H + 24
  return HEADER_H + STAGE_PAD + stages.length * STAGE_H + (stages.length - 1) * STAGE_GAP + STAGE_PAD
}

function layoutFlow(flow: RuleTopologyFlowViewModel): FlowLayout {
  const nodePos = new Map<string, NodePos>()
  const nodeHeightById = new Map<string, number>()
  for (const layer of flow.layers) {
    for (const node of layer) {
      nodeHeightById.set(node.id, nodeHeight(node.stages))
    }
  }

  const layerHeights = flow.layers.map((layer) =>
    Math.max(HEADER_H, ...layer.map((node) => nodeHeightById.get(node.id) ?? HEADER_H)),
  )
  const layerTops: number[] = []
  let cursor = 0
  for (const height of layerHeights) {
    layerTops.push(cursor)
    cursor += height + LAYER_GAP
  }
  const layersHeight =
    flow.layers.length > 0 ? layerTops[flow.layers.length - 1] + layerHeights[flow.layers.length - 1] : 0

  const layerWidths = flow.layers.map(
    (layer) => layer.length * NODE_WIDTH + Math.max(0, layer.length - 1) * NODE_GAP_X,
  )
  const width = Math.max(NODE_WIDTH, ...layerWidths)

  flow.layers.forEach((layer, layerIndex) => {
    const layerWidth = layerWidths[layerIndex]
    const y = layerTops[layerIndex]
    let x = (width - layerWidth) / 2
    for (const node of layer) {
      const height = nodeHeightById.get(node.id) ?? HEADER_H
      nodePos.set(node.id, { x, y, height })
      x += NODE_WIDTH + NODE_GAP_X
    }
  })

  return { nodePos, width, height: layersHeight }
}

function centerX(pos: NodePos) {
  return pos.x + NODE_WIDTH / 2
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function stageTooltip(stage: RuleTopologyStageViewModel) {
  const lines = [stage.name]
  if (stage.businessMeaning) lines.push(`业务含义: ${stage.businessMeaning}`)
  const start =
    stage.startMatcherNames.length > 0
      ? stage.startMatcherNames.join(', ')
      : stage.startMatcherName ?? stage.startMatcherId ?? '-'
  const end =
    stage.endMatcherNames.length > 0
      ? stage.endMatcherNames.join(', ')
      : stage.endMatcherName ?? stage.endMatcherId ?? '-'
  lines.push(`起止: ${start} → ${end}`)
  lines.push(`order=${stage.order}${stage.result ? ` · result=${stage.result}` : ''} · kind=${stage.kind}`)
  lines.push(`enabled=${stage.enabled} · export=${stage.exportEnabled}`)
  return lines.join('\n')
}

function nodeTooltip(node: RuleTopologyNode) {
  const roleText = node.role === 'join' ? '（汇总）' : node.role === 'start' ? '（根）' : ''
  return `${node.label}${roleText}\n${node.processId}\n${node.appName} · ${node.kind} · ${node.stages.length} 个阶段`
}

function stageClassName(stage: RuleTopologyStageViewModel) {
  const parts = ['rule-topology-stage']
  if (stage.kind === 'intercept') parts.push('intercept')
  if (!stage.enabled) parts.push('disabled')
  return parts.join(' ')
}

function renderStageChips(
  node: RuleTopologyNode,
  onSelectNode: ((target: TopologyLocateTarget) => void) | undefined,
  onEditNode: ((target: TopologyLocateTarget) => void) | undefined,
) {
  if (node.stages.length === 0) {
    return (
      <text x={NODE_WIDTH / 2} y={HEADER_H + 17} className="rule-topology-stage-empty" textAnchor="middle">
        该场景无阶段
      </text>
    )
  }

  return node.stages.map((stage, index) => {
    const y = HEADER_H + STAGE_PAD + index * (STAGE_H + STAGE_GAP)
    const select = (event: React.MouseEvent) => {
      event.stopPropagation()
      onSelectNode?.({ nodeType: 'stages', nodeId: stage.id })
    }
    const edit = (event: React.MouseEvent) => {
      event.stopPropagation()
      onEditNode?.({ nodeType: 'stages', nodeId: stage.id })
    }
    return (
      <g key={stage.id} className={stageClassName(stage)} transform={`translate(0, ${y})`} onClick={select} onDoubleClick={edit}>
        <title>{stageTooltip(stage)}</title>
        <rect x={8} width={NODE_WIDTH - 16} height={STAGE_H} rx={5} className="rule-topology-stage-bg" />
        <text x={16} y={STAGE_H / 2 + 4} className="rule-topology-stage-name">
          {`${stage.order}. ${truncate(stage.name, 14)}`}
        </text>
        <text x={NODE_WIDTH - 14} y={STAGE_H / 2 + 4} className="rule-topology-stage-result" textAnchor="end">
          {stage.kind === 'intercept' ? '拦截' : stage.result ?? ''}
        </text>
      </g>
    )
  })
}

function renderNode(
  node: RuleTopologyNode,
  pos: NodePos,
  applications: Array<{ id: string; name: string }>,
  onSelectNode: ((target: TopologyLocateTarget) => void) | undefined,
  onEditNode: ((target: TopologyLocateTarget) => void) | undefined,
) {
  const [fill, stroke, text] = appColor(node.appId, applications)
  const roleBadge = node.role === 'join' ? '汇总' : node.role === 'start' ? '根' : node.kind

  return (
    <g
      key={node.id}
      className="rule-topology-node"
      transform={`translate(${pos.x}, ${pos.y})`}
      onClick={onSelectNode ? () => onSelectNode({ nodeType: 'processes', nodeId: node.processId }) : undefined}
    >
      <title>{nodeTooltip(node)}</title>
      <rect width={NODE_WIDTH} height={pos.height} rx={9} fill={fill} stroke={stroke} strokeWidth={1.4} />
      <line x1={0} y1={HEADER_H} x2={NODE_WIDTH} y2={HEADER_H} stroke={stroke} strokeWidth={1} opacity={0.6} />
      <text x={14} y={20} className="rule-topology-node-title" fill={text}>
        {truncate(node.label, 15)}
      </text>
      <text x={14} y={37} className="rule-topology-node-sub" fill={text}>
        {truncate(`${node.appName} · ${node.kind} · ${node.stages.length} 阶段`, 20)}
      </text>
      <rect
        x={NODE_WIDTH - 46}
        y={9}
        width={38}
        height={18}
        rx={9}
        fill="rgba(255,255,255,0.72)"
        stroke={stroke}
        strokeWidth={1}
      />
      <text x={NODE_WIDTH - 27} y={22} className="rule-topology-node-badge" fill={text} textAnchor="middle">
        {roleBadge}
      </text>
      {renderStageChips(node, onSelectNode, onEditNode)}
    </g>
  )
}

function renderForkJoin(flow: RuleTopologyFlowViewModel, layout: FlowLayout, flowId: string) {
  const { nodePos } = layout
  return flow.fanOuts.map((fanOut) => {
    const parent = nodePos.get(fanOut.parentNodeId)
    const join = nodePos.get(fanOut.joinNodeId)
    if (!parent || !join) return null

    const subPositions = fanOut.subNodeIds.map((id) => nodePos.get(id)).filter((pos): pos is NodePos => !!pos)
    if (subPositions.length === 0) return null

    const subXs = subPositions.map((pos) => centerX(pos))
    const minX = Math.min(...subXs)
    const maxX = Math.max(...subXs)
    const parentX = centerX(parent)
    const parentBottomY = parent.y + parent.height
    const subTopY = subPositions[0].y
    const forkBusY = (parentBottomY + subTopY) / 2

    const subBottomY = subPositions[0].y + subPositions[0].height
    const joinTopY = join.y
    const joinBusY = (subBottomY + joinTopY) / 2

    const forkSegments = [
      <line key="fork-v" x1={parentX} y1={parentBottomY} x2={parentX} y2={forkBusY} />,
      <line key="fork-h" x1={minX} y1={forkBusY} x2={maxX} y2={forkBusY} />,
      ...subPositions.map((pos) => (
        <line
          key={`fork-sub-${pos.x}-${pos.y}`}
          x1={centerX(pos)}
          y1={forkBusY}
          x2={centerX(pos)}
          y2={subTopY}
          markerEnd="url(#rule-topology-arrow-fork)"
        />
      )),
    ]

    const joinSegments = [
      ...subPositions.map((pos) => (
        <line key={`join-sub-${pos.x}-${pos.y}`} x1={centerX(pos)} y1={subBottomY} x2={centerX(pos)} y2={joinBusY} />
      )),
      <line key="join-h" x1={minX} y1={joinBusY} x2={maxX} y2={joinBusY} />,
      <line
        key="join-v"
        x1={centerX(join)}
        y1={joinBusY}
        x2={centerX(join)}
        y2={joinTopY}
        markerEnd="url(#rule-topology-arrow-join)"
      />,
    ]

    return (
      <g key={`${flowId}-fanout-${fanOut.stageId}`}>
        <title>{`${fanOut.label}：扇出到子进程，完成后合并回父进程`}</title>
        <g className="rule-topology-edge-fork">{forkSegments}</g>
        <g className="rule-topology-edge-join">{joinSegments}</g>
        <text x={(parentX + minX) / 2} y={forkBusY - 5} className="rule-topology-edge-label" textAnchor="middle">
          {truncate(fanOut.label, 20)}
        </text>
      </g>
    )
  })
}

function renderRpcEdges(
  flow: RuleTopologyFlowViewModel,
  layout: FlowLayout,
  flowId: string,
  onSelectNode: ((target: TopologyLocateTarget) => void) | undefined,
  onEditNode: ((target: TopologyLocateTarget) => void) | undefined,
) {
  const { nodePos } = layout
  return flow.rpcEdges.map((edge) => {
    const from = nodePos.get(edge.from)
    const to = nodePos.get(edge.to)
    if (!from || !to) return null

    const fromX = centerX(from)
    const fromY = from.y + from.height / 2
    const toX = centerX(to)
    const toY = to.y + to.height / 2
    const curve = Math.max(48, Math.abs(toX - fromX) * 0.5)
    const d = `M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`

    const edit = (event: React.MouseEvent) => {
      event.stopPropagation()
      onEditNode?.({ nodeType: 'stages', nodeId: edge.stageId })
    }

    return (
      <g key={`${flowId}-rpc-${edge.stageId}`} className="rule-topology-edge-rpc-group" onDoubleClick={edit}>
        <title>{`${edge.label}（跨应用 RPC）\n${stageTooltip(edge.stage)}`}</title>
        <path d={d} className="rule-topology-edge-rpc-hit" />
        <path d={d} className="rule-topology-edge-rpc" markerEnd="url(#rule-topology-arrow-rpc)" />
        <text
          x={(fromX + toX) / 2}
          y={(fromY + toY) / 2 - 8}
          className="rule-topology-edge-label rule-topology-edge-label-rpc"
          textAnchor="middle"
        >
          {truncate(edge.label, 20)}
        </text>
      </g>
    )
  })
}

export default function RuleTopologyCanvas({
  activeVersion,
  selectedScenarioId,
  onSelectNode,
  onEditNode,
}: RuleTopologyCanvasProps) {
  const viewModel = useMemo(
    () => buildRuleTopologyViewModel(activeVersion, selectedScenarioId),
    [activeVersion, selectedScenarioId],
  )
  const { flows, applications } = viewModel

  const layout = useMemo(() => {
    const flowLayouts = flows.map((flow) => {
      const flowLayout = layoutFlow(flow)
      return {
        flow,
        layout: flowLayout,
        sectionHeight: FLOW_HEADER_H + flowLayout.height,
      }
    })

    const width = Math.max(NODE_WIDTH, ...flowLayouts.map((item) => item.layout.width)) + PADDING * 2
    const height =
      flowLayouts.reduce((total, item) => total + item.sectionHeight, 0) +
      FLOW_GAP * Math.max(0, flows.length - 1) +
      PADDING * 2

    let cursor = PADDING
    const offsets = flowLayouts.map((item) => {
      const offset = cursor
      cursor += item.sectionHeight + FLOW_GAP
      return offset
    })

    return { flowLayouts, width, height, offsets }
  }, [flows])

  if (flows.length === 0) {
    return (
      <div className="rule-topology">
        <div className="rule-canvas-guide">
          <strong>当前生效版本没有业务流程</strong>
          <p>规则包的 definitions.toml 需要定义至少一个 flow，拓扑图才会显示。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rule-topology">
      <div className="rule-topology-toolbar">
        <div className="rule-topology-legend">
          {applications.map((app) => {
            const [fill, stroke, text] = appColor(app.id, applications)
            return (
              <span key={app.id} className="rule-topology-legend-item">
                <i style={{ background: fill, borderColor: stroke }} />
                <em style={{ color: text }}>{app.name}</em>
              </span>
            )
          })}
        </div>
      </div>

      <div className="rule-topology-scroll">
        <svg
          className="rule-topology-svg"
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label="规则包拓扑图"
        >
          <defs>
            {(['fork', 'join', 'rpc'] as const).map((kind) => {
              const color = kind === 'fork' ? EDGE_FORK : kind === 'join' ? EDGE_JOIN : EDGE_RPC
              return (
                <marker
                  key={kind}
                  id={`rule-topology-arrow-${kind}`}
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="4.5"
                  orient="auto"
                >
                  <path d="M0,0 L9,4.5 L0,9 z" fill={color} />
                </marker>
              )
            })}
          </defs>

          {layout.flowLayouts.map(({ flow, layout: flowLayout }, index) => (
            <g key={flow.flowId} transform={`translate(0, ${layout.offsets[index]})`}>
              <text x={layout.width / 2} y={FLOW_HEADER_H - 12} className="rule-topology-flow-title" textAnchor="middle">
                {`${flow.flowName} · ${flow.domainName}`.replace(/ · $/, '')}
              </text>

              <g transform={`translate(${(layout.width - flowLayout.width) / 2}, ${FLOW_HEADER_H})`}>
                {renderForkJoin(flow, flowLayout, flow.flowId)}
                {renderRpcEdges(flow, flowLayout, flow.flowId, onSelectNode, onEditNode)}
                {flow.layers.flatMap((layer) =>
                  layer.map((node) => {
                    const pos = flowLayout.nodePos.get(node.id)
                    return pos ? renderNode(node, pos, applications, onSelectNode, onEditNode) : null
                  }),
                )}
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
