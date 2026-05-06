import { Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import lines from '../../../../../assets/images/pdf/lines.png'

const styles = StyleSheet.create({
  tipsPage: {
    padding: 36,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
  },
  tipsLinesTopRight: {
    position: 'absolute',
    top: -160,
    right: -160,
    width: 280,
    height: 'auto',
    transform: 'rotate(45deg)',
  },
  tipsTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: '#221755',
    marginBottom: 24,
    marginTop: 60,
    lineHeight: 1.2,
  },
  tipBlock: {
    backgroundColor: '#fce7f3',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ec4899',
    marginRight: 10,
    marginTop: 2,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 9,
    color: '#4b5563',
    lineHeight: 1.4,
  },
  tipsInfoBanner: {
    marginTop: 'auto',
    backgroundColor: '#fce7f3',
    borderRadius: 6,
    padding: 12,
  },
  tipsInfoText: {
    fontSize: 9,
    color: '#1f2937',
    lineHeight: 1.4,
  },
  tipsInfoTextSpaced: {
    fontSize: 9,
    color: '#1f2937',
    lineHeight: 1.4,
    marginTop: 4,
  },
  tipsInfoBold: {
    fontFamily: 'Helvetica-Bold',
  },
})

const TIPS = [
  {
    title: 'Soyez ponctuel·le',
    text: "La ponctualité est essentielle au bon déroulement des séances. Cela permet de respecter le travail de l'équipe soignante, mais aussi celui des autres patients. Merci d'arriver à l'heure indiquée pour chaque activité.",
  },
  {
    title: "Ce qu'il faut apporter chaque jour",
    text: "Pour pratiquer une activité physique en toute sécurité et dans de bonnes conditions, il est important de porter des vêtements et des chaussures confortables et adaptés à l'effort. Des casiers sont à votre disposition dans les vestiaires. Merci d'apporter un cadenas ! Pensez à prendre une gourde d'eau pour vous hydrater pendant et après l'effort.",
  },
  {
    title: 'Prenez un petit-déjeuner avant de venir',
    text: "Il est essentiel de manger le matin avant votre venue. Un petit-déjeuner équilibré vous donnera l'énergie nécessaire pour participer activement à votre programme.",
  },
  {
    title: 'Soyez reposé·e',
    text: "Un bon repos est indispensable pour votre récupération et pour profiter pleinement de chaque activité. Essayez de venir reposé·e, en forme, et l'écoute de votre corps.",
  },
]

export default function TipsPage() {
  return (
    <Page size="A4" style={styles.tipsPage}>
      <Image src={lines} style={styles.tipsLinesTopRight} />

      <Text style={styles.tipsTitle}>
        {'Comment\nréussir\nson programme ?'}
      </Text>

      {TIPS.map((tip) => (
        <View key={tip.title} style={styles.tipBlock}>
          <View style={styles.tipDot} />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        </View>
      ))}

      <View style={styles.tipsInfoBanner}>
        <Text style={styles.tipsInfoText}>
          <Text style={styles.tipsInfoBold}>
            Souvenez-vous que ce programme est fait pour vous, et que chaque
            effort vous fait vous rapprocher d'un meilleur équilibre de vie.{' '}
          </Text>
          Toute l'équipe SMCV est là pour vous accompagner.
        </Text>
        <Text style={styles.tipsInfoTextSpaced}>
          En cas de doute ou d'absence, merci de contacter le service au{' '}
          <Text style={styles.tipsInfoBold}>05 57 62 32 91</Text>
        </Text>
      </View>
    </Page>
  )
}
