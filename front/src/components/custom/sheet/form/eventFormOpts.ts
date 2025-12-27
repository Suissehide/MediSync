export interface EventFormValues {
  thematic: string
  location: string
  description: string
  isIndividual: boolean
  soignant: string
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematic: '',
    location: '',
    description: '',
    isIndividual: false,
    soignant: '',
    color: '',
  },
}
