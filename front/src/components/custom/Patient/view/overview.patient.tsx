import dayjs from 'dayjs'

import type { Patient } from '../../../../types/patient.ts'

interface OverviewPatientProps {
  patient?: Patient
}

export default function OverviewPatient({ patient }: OverviewPatientProps) {
  return (
    <div className="h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
      <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
        <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
          Rendez-vous
        </span>
      </h4>

      <h5 className="mt-4 mb-2 text-sm text-text-light uppercase font-semibold">
        À venir
      </h5>
      <div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 rounded-lg px-3 py-2 bg-[#CE51B220]">
            <div className="border-2 border-[#CE51B2] rounded-lg" />
            <div className="flex flex-col">
              <div>
                Psychologue{' '}
                <span className="text-[#CE51B2] font-semibold">Bureau 1</span>
              </div>
              <div className="text-text-light">
                {`${dayjs(new Date())
                  .format('dddd D MMMM YYYY hh:mm')
                  .replace(/^./, (c) =>
                    c.toUpperCase(),
                  )} - ${dayjs(new Date()).format('hh:mm')}`}{' '}
              </div>
            </div>
          </div>

          <div className="flex gap-2 rounded-lg px-3 py-2 bg-[#519ad520]">
            <div className="border-2 border-[#519ad5] rounded-lg" />
            <div className="flex flex-col">
              <div>
                Pharmacienne{' '}
                <span className="text-[#519ad5] font-semibold">
                  Salle enseignement
                </span>
              </div>
              <div className="text-text-light">
                {`${dayjs(new Date())
                  .format('dddd D MMMM YYYY hh:mm')
                  .replace(/^./, (c) =>
                    c.toUpperCase(),
                  )} - ${dayjs(new Date()).format('hh:mm')}`}{' '}
              </div>
            </div>
          </div>
        </div>
      </div>

      <h5 className="my-2 text-sm text-text-light uppercase font-semibold">
        Passés
      </h5>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 rounded-lg px-3 py-2 bg-[#CE51B220]">
          <div className="border-2 border-[#CE51B2] rounded-lg" />
          <div className="flex flex-col">
            <div>
              Psychologue{' '}
              <span className="text-[#CE51B2] font-semibold">Bureau 1</span>
            </div>
            <div className="text-text-light">
              {`${dayjs(new Date())
                .format('dddd D MMMM YYYY hh:mm')
                .replace(/^./, (c) =>
                  c.toUpperCase(),
                )} - ${dayjs(new Date()).format('hh:mm')}`}{' '}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
