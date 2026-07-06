export interface EventFormValues {
  thematicId: string
  locationID: string
  description: string
  isIndividual: boolean
  capacity: number
  soignantIDs: string[]
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematicId: '',
    locationID: '',
    description: '',
    isIndividual: false,
    capacity: 15,
    soignantIDs: [],
    color: '',
  },
}
