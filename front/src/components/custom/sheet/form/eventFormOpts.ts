export interface EventFormValues {
  thematic: string
  locationID: string
  description: string
  isIndividual: boolean
  capacity: number
  soignant: string
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematic: '',
    locationID: '',
    description: '',
    isIndividual: false,
    capacity: 15,
    soignant: '',
    color: '',
  },
}
