export interface EventFormValues {
  thematic: string
  location: string
  description: string
  isIndividual: boolean
  capacity: number
  duration: number
  soignant: string
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematic: '',
    location: '',
    description: '',
    isIndividual: false,
    capacity: 15,
    duration: 1,
    soignant: '',
    color: '',
  },
}
