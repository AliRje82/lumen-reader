import type { AnnotationRecord, NormRect, StrokePoint, ToolMode } from '@/types'
import { HIGHLIGHT_COLORS } from '@/types'

interface AnnotationLayerProps {
  annotations: AnnotationRecord[]
  width: number
  height: number
  liveStroke: StrokePoint[] | null
  liveTool: ToolMode
  liveColor: string
  liveWidth: number
  regionPreview: NormRect | null
}

function colorHex(c: string): string {
  return (HIGHLIGHT_COLORS as Record<string, string>)[c] ?? c
}

function strokePath(points: StrokePoint[], w: number, h: number): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`)
    .join(' ')
}

export function AnnotationLayer({
  annotations,
  width,
  height,
  liveStroke,
  liveTool,
  liveColor,
  liveWidth,
  regionPreview,
}: AnnotationLayerProps) {
  return (
    <svg
      className="annotation-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {annotations.map((ann) => {
        if (ann.kind === 'ink' && ann.stroke) {
          return (
            <path
              key={ann.id}
              d={strokePath(ann.stroke.points, width, height)}
              fill="none"
              stroke={ann.stroke.color}
              strokeWidth={ann.stroke.width * (width / 600)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={ann.stroke.opacity}
            />
          )
        }

        if (ann.kind === 'region' && ann.region) {
          const r = ann.region
          return (
            <rect
              key={ann.id}
              x={r.x * width}
              y={r.y * height}
              width={r.w * width}
              height={r.h * height}
              fill={colorHex(ann.color)}
              opacity={0.35}
            />
          )
        }

        if (ann.quads) {
          return (
            <g key={ann.id}>
              {ann.quads.rects.map((r, i) => {
                const x = r.x * width
                const y = r.y * height
                const rw = r.w * width
                const rh = r.h * height
                const fill = colorHex(ann.color)
                if (ann.kind === 'underline') {
                  return (
                    <line
                      key={i}
                      x1={x}
                      y1={y + rh + 1}
                      x2={x + rw}
                      y2={y + rh + 1}
                      stroke={fill}
                      strokeWidth={2}
                    />
                  )
                }
                if (ann.kind === 'strikethrough') {
                  return (
                    <line
                      key={i}
                      x1={x}
                      y1={y + rh / 2}
                      x2={x + rw}
                      y2={y + rh / 2}
                      stroke={fill}
                      strokeWidth={2}
                    />
                  )
                }
                return (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={rw}
                    height={rh}
                    fill={fill}
                    opacity={0.4}
                  />
                )
              })}
              {ann.note ? (
                <circle
                  cx={(ann.quads.rects[0]!.x + ann.quads.rects[0]!.w) * width}
                  cy={ann.quads.rects[0]!.y * height}
                  r={6}
                  fill="#e8b923"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              ) : null}
            </g>
          )
        }

        if (ann.kind === 'note' && ann.region) {
          return (
            <g key={ann.id}>
              <circle
                cx={ann.region.x * width}
                cy={ann.region.y * height}
                r={8}
                fill="#e8b923"
                stroke="#fff"
                strokeWidth={1.5}
              />
            </g>
          )
        }

        return null
      })}

      {regionPreview && (
        <rect
          x={regionPreview.x * width}
          y={regionPreview.y * height}
          width={regionPreview.w * width}
          height={regionPreview.h * height}
          fill={colorHex('yellow')}
          opacity={0.3}
          stroke="#c9a227"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      )}

      {liveStroke && liveStroke.length > 1 && (liveTool === 'pen' || liveTool === 'highlighter-pen') && (
        <path
          d={strokePath(liveStroke, width, height)}
          fill="none"
          stroke={liveColor}
          strokeWidth={liveWidth * (width / 600)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={liveTool === 'highlighter-pen' ? 0.35 : 1}
        />
      )}
    </svg>
  )
}
