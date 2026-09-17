import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { getContrastTextColor } from '../../../../libs/color.ts'
import type { Slot } from '../../../../types/slot.ts'
import type { PlanningWeek } from './planning-pdf.utils.ts'

const PAGE_PADDING = 22
const DAY_HEADER_HEIGHT = 24

// Plafond de hauteur d'une ligne, pour éviter la bande géante quand la semaine
// n'en compte qu'une ou deux.
const MAX_ROW_HEIGHT = 170

// Hauteur restant aux lignes une fois l'en-tête et la ligne des jours posés,
// mesurée sur un rendu réel (16 lignes de 31 pt tenaient tout juste). react-pdf
// pagine avant de résoudre flexbox : `flexShrink` ne comprime donc rien, et
// c'est cette hauteur explicite qui garantit une semaine par page.
const AVAILABLE_ROWS_HEIGHT = 496

// Tailles de police à densité confortable, et hauteur qu'occupent les deux
// lignes d'un créneau à cette échelle (interligne ~1,25, marges et bordures).
const BASE_FONT_SIZES = { thematic: 8.5, details: 7.5 }
const BASE_BLOCK_HEIGHT = 28
const BASE_TIME_LABEL_SIZE = 8
const MIN_FONT_SCALE = 0.55

const DAY_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI']

const DEFAULT_SLOT_COLOR = '#94a3b8'

const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontFamily: 'Helvetica',
    color: '#1f2937',
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
  },
  closureBlock: {
    flexShrink: 0,
    paddingVertical: 6,
    marginBottom: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 0.5,
    borderColor: '#fecaca',
  },
  closureText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#b91c1c',
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 12,
  },
  grid: {
    flexGrow: 1,
    flexDirection: 'column',
  },
  dayHeaderRow: {
    flexShrink: 0,
    flexDirection: 'row',
    height: DAY_HEADER_HEIGHT,
  },
  cornerCell: {
    width: 54,
    backgroundColor: '#f3f4f6',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
  },
  dayHeaderCell: {
    flex: 1,
    backgroundColor: '#e0e7ff',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayHeaderName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#312e81',
  },
  dayHeaderDate: {
    fontSize: 7.5,
    color: '#4338ca',
  },
  timeRow: {
    flexDirection: 'row',
    // La hauteur exacte est posée à l'affichage (`computeRowHeight`) : elle
    // dépend du nombre de lignes de la semaine. `overflow: 'hidden'` garde un
    // texte trop long à l'intérieur de sa case plutôt que par-dessus la
    // voisine.
    flexShrink: 0,
    overflow: 'hidden',
  },
  timeLabelCell: {
    width: 54,
    backgroundColor: '#f9fafb',
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeLabelText: {
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    textAlign: 'center',
  },
  dayCell: {
    // En paysage la largeur abonde et la hauteur manque : deux parcours en
    // parallèle se placent côte à côte, chacun gardant toute la hauteur de la
    // ligne, au lieu de se partager une demi-hauteur illisible.
    flexDirection: 'row',
    flex: 1,
    borderWidth: 0.5,
    borderColor: '#d1d5db',
    padding: 1.5,
    overflow: 'hidden',
  },
  slotBlock: {
    // `flexBasis: 'auto'` — avec une base à 0, react-pdf mesure le bloc avant
    // son contenu et le texte disparaît dès qu'une case porte deux créneaux.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 3,
    marginRight: 1.5,
    overflow: 'hidden',
  },
  slotThematic: {
    fontFamily: 'Helvetica-Bold',
    textOverflow: 'ellipsis',
  },
  slotDetails: {
    marginTop: 1,
    // Une seule ligne, tronquée proprement : sans cela le texte repart à la
    // ligne et `overflow: 'hidden'` le coupe en plein milieu d'un mot.
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
})

/** Les lignes de la semaine se partagent à parts égales la hauteur restante. */
function computeRowHeight(rowCount: number) {
  return Math.min(MAX_ROW_HEIGHT, AVAILABLE_ROWS_HEIGHT / rowCount)
}

/**
 * Plus la semaine compte de lignes, plus chacune est basse : on réduit la
 * police d'autant pour que les deux lignes d'un créneau continuent d'y tenir
 * sans être rognées.
 */
function computeFontScale(rowHeight: number) {
  return Math.max(MIN_FONT_SCALE, Math.min(1, rowHeight / BASE_BLOCK_HEIGHT))
}

/** La thématique ne s'autorise deux lignes que si la ligne est assez haute. */
function computeThematicMaxLines(rowHeight: number) {
  return rowHeight >= BASE_BLOCK_HEIGHT * 1.5 ? 2 : 1
}

function SlotBlock({
  slot,
  fontScale,
  thematicMaxLines,
}: {
  slot: Slot
  fontScale: number
  thematicMaxLines: number
}) {
  const background =
    slot.slotTemplate?.color ??
    slot.pathway?.template?.color ??
    DEFAULT_SLOT_COLOR
  const color = getContrastTextColor(background)
  const soignants = slot.slotTemplate?.soignants
    ?.map((soignant) => soignant.name)
    .join(', ')
  const location = slot.slotTemplate?.location?.name
  // Soignants et salle sur une seule ligne : en hauteur, chaque ligne gagnée
  // permet une police plus grande sur une semaine dense.
  const details = [soignants, location].filter(Boolean).join(' - ')

  return (
    <View style={[styles.slotBlock, { backgroundColor: background }]}>
      <Text
        style={[
          styles.slotThematic,
          {
            color,
            fontSize: BASE_FONT_SIZES.thematic * fontScale,
            maxLines: thematicMaxLines,
          },
        ]}
      >
        {slot.slotTemplate?.thematic ?? 'Sans thématique'}
      </Text>
      {details && (
        <Text
          style={[
            styles.slotDetails,
            { color, fontSize: BASE_FONT_SIZES.details * fontScale },
          ]}
        >
          {details}
        </Text>
      )}
    </View>
  )
}

function WeekPage({ week }: { week: PlanningWeek }) {
  const rowHeight = computeRowHeight(week.timeRows.length)
  const fontScale = computeFontScale(rowHeight)
  const thematicMaxLines = computeThematicMaxLines(rowHeight)

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Semaine {week.weekLabel}</Text>
        <Text style={styles.subtitle}>
          du {week.weekStart.format('DD/MM/YYYY')} au{' '}
          {week.weekStart.add(4, 'day').format('DD/MM/YYYY')}
        </Text>
      </View>

      {week.isClosed && (
        <View style={styles.closureBlock}>
          <Text style={styles.closureText}>
            Service fermé — semaine interdite
          </Text>
        </View>
      )}

      {week.timeRows.length === 0 ? (
        // Sur une semaine fermée, la mention de fermeture dit déjà tout.
        !week.isClosed && (
          <Text style={styles.emptyMessage}>Aucun créneau cette semaine.</Text>
        )
      ) : (
        <View style={styles.grid}>
          <View style={styles.dayHeaderRow} wrap={false}>
            <View style={styles.cornerCell} />
            {DAY_NAMES.map((name, dayIndex) => (
              <View key={name} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderName}>{name}</Text>
                <Text style={styles.dayHeaderDate}>
                  {week.weekStart.add(dayIndex, 'day').format('DD/MM')}
                </Text>
              </View>
            ))}
          </View>

          {week.timeRows.map((row) => (
            <View
              key={row.timeLabel}
              style={[styles.timeRow, { height: rowHeight }]}
              wrap={false}
            >
              <View style={styles.timeLabelCell}>
                <Text
                  style={[
                    styles.timeLabelText,
                    { fontSize: BASE_TIME_LABEL_SIZE * fontScale },
                  ]}
                >
                  {row.timeLabel}
                </Text>
              </View>
              {row.cells.map((slots, dayIndex) => (
                <View key={DAY_NAMES[dayIndex]} style={styles.dayCell}>
                  {slots.map((slot) => (
                    <SlotBlock
                      key={slot.id}
                      slot={slot}
                      fontScale={fontScale}
                      thematicMaxLines={thematicMaxLines}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </Page>
  )
}

export default function PlanningWeeksPDF({ weeks }: { weeks: PlanningWeek[] }) {
  return (
    <Document>
      {weeks.map((week) => (
        <WeekPage key={week.weekStart.format('YYYY-MM-DD')} week={week} />
      ))}
    </Document>
  )
}
