import {
  assertTenantScope,
  ESTABLISHMENT_MODELS,
  MODEL_RELATIONS,
  SERVICE_MODELS,
  SUPERADMIN_GLOBAL_OPERATIONS,
  SUPERADMIN_OPERATIONS,
} from '../../../main/infra/orm/tenant-guard'
import type { TenantStore } from '../../../main/types/utils/tenant-context'
import { TenantScopeMissingError } from '../../../main/utils/tenant-errors'

const store: TenantStore = {
  kind: 'tenant',
  tenant: {
    userId: 'u1',
    establishmentId: 'e1',
    establishmentRole: 'MEMBER',
    serviceId: 's1',
    serviceRole: 'INTERVENANT',
    soignantId: null,
  },
}
const adminStore: TenantStore = {
  kind: 'tenant',
  tenant: { ...store.tenant, serviceId: null, serviceRole: null, establishmentRole: 'ADMIN' },
}

describe('assertTenantScope', () => {
  it('laisse passer un modele global sans filtre', () => {
    expect(() =>
      assertTenantScope({ model: 'User', operation: 'findMany', args: {} }, store),
    ).not.toThrow()
  })

  // `Establishment` est lui aussi un modele global (ni SERVICE_MODELS ni
  // ESTABLISHMENT_MODELS) et TOUTES ses relations menent a des donnees de
  // tenant : sans entree dans GLOBAL_TENANT_RELATIONS, un
  // `establishment.findMany({ include: { patients: true } })` traversait le
  // garde-fou sans controle.
  it('refuse un include de relation de tenant sur Establishment hors findUnique(OrThrow)', () => {
    for (const relation of ['services', 'memberships', 'patients', 'soignants', 'locations']) {
      expect(() =>
        assertTenantScope(
          { model: 'Establishment', operation: 'findMany', args: { include: { [relation]: true } } },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    }
    expect(() =>
      assertTenantScope(
        { model: 'Establishment', operation: 'findFirst', args: { select: { patients: true } } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Establishment', operation: 'findUnique', args: { where: { id: 'e1' }, include: { patients: true } } },
        store,
      ),
    ).not.toThrow()
    expect(() =>
      assertTenantScope({ model: 'Establishment', operation: 'findMany', args: {} }, store),
    ).not.toThrow()
  })

  it('exige serviceId en lecture sur un modele de service', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'findMany', args: { where: {} } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('accepte la cle composite id_serviceId', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Slot',
          operation: 'findUnique',
          args: { where: { id_serviceId: { id: 'x', serviceId: 's1' } } },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse un serviceId different du tenant', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 'autre' } } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('exige les deux colonnes a la creation, y compris imbriquee', () => {
    const okData = {
      startDate: new Date(),
      serviceId: 's1',
      establishmentId: 'e1',
      appointmentPatients: { create: [{ patientId: 'p', serviceId: 's1', establishmentId: 'e1' }] },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: okData } }, store),
    ).not.toThrow()
    const badNested = {
      ...okData,
      appointmentPatients: { create: [{ patientId: 'p' }] },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: badNested } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Todo', operation: 'createMany', args: { data: [{ title: 't', serviceId: 's1' }] } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('exige establishmentId sur un modele d etablissement', () => {
    expect(() =>
      assertTenantScope({ model: 'Patient', operation: 'findMany', args: { where: {} } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Patient', operation: 'findMany', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse un modele de service sous un tenant sans service', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } },
        adminStore,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse toute operation sans contexte, sauf sur un modele global', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } }, undefined),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope({ model: 'User', operation: 'findUnique', args: { where: { id: 'u' } } }, undefined),
    ).not.toThrow()
  })

  it('laisse tout passer sous le marqueur systeme', () => {
    expect(() =>
      assertTenantScope({ model: 'ActivityLog', operation: 'deleteMany', args: { where: {} } }, { kind: 'system' }),
    ).not.toThrow()
  })

  // Correction 1 : createManyAndReturn / updateManyAndReturn, et refus des operations inconnues.
  it('soumet createManyAndReturn et updateManyAndReturn aux memes exigences que leurs equivalents', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'updateManyAndReturn', args: { where: {} } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'updateManyAndReturn', args: { where: { serviceId: 's1' } } },
        store,
      ),
    ).not.toThrow()
    expect(() =>
      assertTenantScope(
        { model: 'Todo', operation: 'createManyAndReturn', args: { data: [{ title: 't' }] } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        {
          model: 'Todo',
          operation: 'createManyAndReturn',
          args: { data: [{ title: 't', serviceId: 's1', establishmentId: 'e1' }] },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse une operation inconnue sur un modele de tenant', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'inconnue', args: {} }, store),
    ).toThrow(TenantScopeMissingError)
  })

  // Correction 2 : relations imbriquees non declarees refusees, verbes d'ecriture imbriquee.
  it('refuse une relation imbriquee non declaree, accepte une relation declaree', () => {
    const withUndeclared = {
      startDate: new Date(),
      serviceId: 's1',
      establishmentId: 'e1',
      slot: { create: { startDate: new Date(), serviceId: 's1', establishmentId: 'e1' } },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: withUndeclared } }, store),
    ).toThrow(TenantScopeMissingError)
    const withDeclared = {
      startDate: new Date(),
      serviceId: 's1',
      establishmentId: 'e1',
      appointmentPatients: { create: [{ patientId: 'p', serviceId: 's1', establishmentId: 'e1' }] },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: withDeclared } }, store),
    ).not.toThrow()
  })

  it('verifie connect et connectOrCreate, laisse passer un update imbrique', () => {
    const base = { startDate: new Date(), serviceId: 's1', establishmentId: 'e1' }

    const bareConnect = { ...base, appointmentPatients: { connect: { id: 'ap1' } } }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: bareConnect } }, store),
    ).toThrow(TenantScopeMissingError)

    const compositeConnect = {
      ...base,
      appointmentPatients: { connect: { id_serviceId: { id: 'ap1', serviceId: 's1' } } },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: compositeConnect } }, store),
    ).not.toThrow()

    const connectOrCreateOk = {
      ...base,
      appointmentPatients: {
        connectOrCreate: {
          where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
          create: { patientId: 'p', serviceId: 's1', establishmentId: 'e1' },
        },
      },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: connectOrCreateOk } }, store),
    ).not.toThrow()

    const connectOrCreateBadCreate = {
      ...base,
      appointmentPatients: {
        connectOrCreate: {
          where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
          create: { patientId: 'p' },
        },
      },
    }
    expect(() =>
      assertTenantScope(
        { model: 'Appointment', operation: 'create', args: { data: connectOrCreateBadCreate } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)

    const connectOrCreateBadWhere = {
      ...base,
      appointmentPatients: {
        connectOrCreate: {
          where: { id: 'ap1' },
          create: { patientId: 'p', serviceId: 's1', establishmentId: 'e1' },
        },
      },
    }
    expect(() =>
      assertTenantScope(
        { model: 'Appointment', operation: 'create', args: { data: connectOrCreateBadWhere } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)

    const nestedUpdate = {
      ...base,
      appointmentPatients: { update: { where: { id: 'ap1' }, data: { patientId: 'p2' } } },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: nestedUpdate } }, store),
    ).not.toThrow()
  })

  // Correction 6 : les deux trous symetriques des ecritures imbriquees.
  // Le CHOIX de la ligne touchee par un update/upsert imbrique est garanti par
  // la relation ; ce qui s'y ECRIT ne l'etait pas.
  describe('charge des ecritures imbriquees update / upsert', () => {
    const base = { startDate: new Date(), serviceId: 's1', establishmentId: 'e1' }
    const create = (data: object) =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data } }, store)

    it('refuse la branche create d un upsert imbrique sans colonnes de tenant', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            upsert: {
              where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
              create: { patientId: 'p' },
              update: {},
            },
          },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse la branche create d un upsert imbrique vers un autre tenant, en tableau', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            upsert: [
              {
                where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
                create: { patientId: 'p', serviceId: 's1', establishmentId: 'e1' },
                update: {},
              },
              {
                where: { id_serviceId: { id: 'ap2', serviceId: 's1' } },
                create: { patientId: 'p2', serviceId: 'autre', establishmentId: 'e1' },
                update: {},
              },
            ],
          },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse la branche update d un upsert imbrique qui deplace l enfant', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            upsert: {
              where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
              create: { patientId: 'p', serviceId: 's1', establishmentId: 'e1' },
              update: { serviceId: 'autre' },
            },
          },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('accepte un upsert imbrique legitime', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            upsert: {
              where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
              create: { patientId: 'p', serviceId: 's1', establishmentId: 'e1' },
              update: { transmissionNotes: 'x' },
            },
          },
        }),
      ).not.toThrow()
    })

    it('refuse un update imbrique dont le data porte un serviceId etranger', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            update: { where: { id: 'ap1' }, data: { serviceId: 'autre' } },
          },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse un update imbrique sous sa forme courte, ou l entree EST le data', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: { update: { establishmentId: 'autre' } },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse un updateMany imbrique dont le data deplace l enfant', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            updateMany: [{ where: { patientId: 'p' }, data: { serviceId: 'autre' } }],
          },
        }),
      ).toThrow(TenantScopeMissingError)
    })

    it('descend dans les relations imbriquees d un update imbrique', () => {
      // Slot > appointments (update) > appointmentPatients (create) : la
      // recursion doit atteindre la creation la plus profonde.
      const deep = (patient: object) => ({
        ...base,
        appointments: {
          update: {
            where: { id_serviceId: { id: 'a1', serviceId: 's1' } },
            data: { appointmentPatients: { create: [patient] } },
          },
        },
      })
      expect(() =>
        assertTenantScope(
          { model: 'Slot', operation: 'create', args: { data: deep({ patientId: 'p' }) } },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
      expect(() =>
        assertTenantScope(
          {
            model: 'Slot',
            operation: 'create',
            args: {
              data: deep({ patientId: 'p', serviceId: 's1', establishmentId: 'e1' }),
            },
          },
          store,
        ),
      ).not.toThrow()
    })

    it('accepte un update imbrique legitime', () => {
      expect(() =>
        create({
          ...base,
          appointmentPatients: {
            update: { where: { id: 'ap1' }, data: { transmissionNotes: 'x' } },
          },
        }),
      ).not.toThrow()
    })
  })

  // Correction 3 : include/select sur une relation de tenant depuis un modele global.
  // La relation citee ici est `establishmentMemberships`, la seule que `model User` declare
  // reellement. L'exemple portait auparavant sur un `User.soignant` disparu du schema depuis
  // l'etape 1 : le test passait donc sur une relation inexistante, et n'aurait rien vu si la
  // vraie relation avait quitte GLOBAL_TENANT_RELATIONS. C'est desormais
  // `tenant-guard-schema.test.ts` qui tient la table contre le schema, dans les deux sens.
  it('refuse un include de relation de tenant hors findUnique(OrThrow)', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'User',
          operation: 'findMany',
          args: { include: { establishmentMemberships: true } },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        {
          model: 'User',
          operation: 'findUniqueOrThrow',
          args: { include: { establishmentMemberships: true } },
        },
        store,
      ),
    ).not.toThrow()
    expect(() =>
      assertTenantScope({ model: 'User', operation: 'findMany', args: {} }, store),
    ).not.toThrow()
  })

  // Correction 4 : deplacement d'une ligne vers un autre tenant via update.
  it('refuse un update qui change le tenant de la ligne', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Patient',
          operation: 'update',
          args: { where: { establishmentId: 'e1' }, data: { establishmentId: 'autre' } },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        {
          model: 'Patient',
          operation: 'update',
          args: { where: { establishmentId: 'e1' }, data: { name: 'x' } },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('verifie les deux branches d un upsert', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Slot',
          operation: 'upsert',
          args: {
            where: { id_serviceId: { id: 'x', serviceId: 's1' } },
            create: { startDate: new Date(), serviceId: 's1', establishmentId: 'e1' },
            update: { establishmentId: 'e1' },
          },
        },
        store,
      ),
    ).not.toThrow()
    expect(() =>
      assertTenantScope(
        {
          model: 'Slot',
          operation: 'upsert',
          args: {
            where: { id_serviceId: { id: 'x', serviceId: 's1' } },
            create: { startDate: new Date() },
            update: {},
          },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        {
          model: 'Slot',
          operation: 'upsert',
          args: {
            where: { id_serviceId: { id: 'x', serviceId: 's1' } },
            create: { startDate: new Date(), serviceId: 's1', establishmentId: 'e1' },
            update: { establishmentId: 'autre' },
          },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  // Correction 5 : durcissements de whereValue / expectedValue.
  it('refuse un where sans filtre direct : valeur indirecte, operateur logique, cle composite incomplete', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'findMany', args: { where: { serviceId: undefined } } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: { in: ['s1'] } } } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { OR: [{ serviceId: 's1' }] } } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        {
          model: 'AppointmentPatient',
          operation: 'findMany',
          args: { where: { appointmentId_patientId: { appointmentId: 'a1', patientId: 'p1' } } },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  // Correction 2, tour 2 : descente dans les relations imbriquees sous update/updateMany/upsert.
  it('accepte une creation imbriquee sous update avec les bonnes colonnes', () => {
    const okData = {
      soignantLinks: { create: [{ soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' }] },
    }
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: { where: { id_serviceId: { id: 't1', serviceId: 's1' } }, data: okData },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse une creation imbriquee sous update sans les colonnes de tenant', () => {
    const missingColumns = {
      soignantLinks: { create: [{ soignantId: 'so1' }] },
    }
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: { where: { id_serviceId: { id: 't1', serviceId: 's1' } }, data: missingColumns },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse une creation imbriquee sous update pour un tenant different', () => {
    const wrongTenant = {
      soignantLinks: { create: [{ soignantId: 'so1', serviceId: 'autre', establishmentId: 'e1' }] },
    }
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: { where: { id_serviceId: { id: 't1', serviceId: 's1' } }, data: wrongTenant },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse une relation non declaree sous update', () => {
    const undeclared = { pathwayTemplates: { create: [{ name: 'x' }] } }
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: { where: { id_serviceId: { id: 't1', serviceId: 's1' } }, data: undeclared },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('laisse passer un deleteMany imbrique sous update', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: {
            where: { id_serviceId: { id: 't1', serviceId: 's1' } },
            data: { soignantLinks: { deleteMany: {} } },
          },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('accepte le cas reel de la tache 10 : deleteMany puis create imbriques', () => {
    const replaceLinks = {
      soignantLinks: {
        deleteMany: {},
        create: [{ soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' }],
      },
    }
    expect(() =>
      assertTenantScope(
        {
          model: 'Thematic',
          operation: 'update',
          args: { where: { id_serviceId: { id: 't1', serviceId: 's1' } }, data: replaceLinks },
        },
        store,
      ),
    ).not.toThrow()
  })

  // Correction 7 : include/select depuis un modele d'etablissement vers un modele de service.
  // Noms de relations repris de prisma/schema.prisma (modeles Patient, Soignant,
  // EstablishmentMembership).
  describe('inclusions depuis un modele d etablissement', () => {
    // Fuite reelle trouvee a l'etape 1 : un patient (etablissement) incluant un modele de
    // service remontait celui de tous les services. Depuis la tache 6, ce n'est plus
    // `enrollmentIssues` qui l'illustre (retire de Patient : les problemes d'inscription
    // dependent desormais du sous-dossier de service, pas du patient) mais `serviceFiles`,
    // la relation de Patient vers PatientServiceFile qui porte la meme exigence de filtre.
    it('refuse une inclusion vers un modele de service sans filtre', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, include: { serviceFiles: true } },
          },
          store,
        ),
      ).toThrow(/serviceFiles/)
    })

    it('accepte la meme inclusion filtree sur le service courant', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: { serviceFiles: { where: { serviceId: 's1' } } },
            },
          },
          store,
        ),
      ).not.toThrow()
    })

    it('refuse une inclusion filtree sur un autre service', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: { serviceFiles: { where: { serviceId: 'autre' } } },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('laisse passer une inclusion vers un modele du meme niveau', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, include: { establishment: true } },
          },
          store,
        ),
      ).not.toThrow()
    })

    it('refuse une relation non declaree plutot que de la laisser sans controle', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, include: { relationFuture: true } },
          },
          store,
        ),
      ).toThrow(/MODEL_RELATIONS/)
    })

    it('controle aussi le select, et ignore une relation ecartee par false', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Soignant',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, select: { id: true, todos: true } },
          },
          store,
        ),
      ).toThrow(/todos/)
      expect(() =>
        assertTenantScope(
          {
            model: 'Soignant',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              select: { id: true, todos: { where: { serviceId: 's1' } } },
            },
          },
          store,
        ),
      ).not.toThrow()
      expect(() =>
        assertTenantScope(
          {
            model: 'Soignant',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, include: { todos: false } },
          },
          store,
        ),
      ).not.toThrow()
    })

    // Inclusion conditionnelle : la branche negative laisse la valeur indefinie, ce que Prisma
    // traite exactement comme une cle non ecrite. Aucune ligne n'est ramenee, il n'y a donc rien
    // a filtrer — refuser ici refuserait du code legitime.
    it('laisse passer une relation laissee indefinie par une inclusion conditionnelle', () => {
      const withIssues = (demande: boolean) =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: { serviceFiles: demande ? { where: { serviceId: 's1' } } : undefined },
            },
          },
          store,
        )
      expect(() => withIssues(false)).not.toThrow()
      expect(() => withIssues(true)).not.toThrow()
      // Meme idiome sous un contexte sans service : la branche negative reste legitime.
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, include: { serviceFiles: undefined } },
          },
          adminStore,
        ),
      ).not.toThrow()
    })

    // Sous le prefixe d'administration d'etablissement, il n'existe aucun service courant :
    // rien ne peut filtrer l'inclusion, elle est donc refusee.
    it('refuse une inclusion de service depuis un contexte sans service', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: { serviceFiles: { where: { serviceId: 's1' } } },
            },
          },
          adminStore,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('vaut aussi pour une ecriture qui renvoie des relations incluses', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'create',
            args: {
              data: { firstName: 'A', establishmentId: 'e1' },
              include: { serviceFiles: true },
            },
          },
          store,
        ),
      ).toThrow(/serviceFiles/)
    })

    // Lectures reelles qui doivent continuer a passer : la liste des membres (relations de la
    // meme famille ou globales) et la route de lecture des soignants du routeur
    // d'administration d'etablissement (aucune inclusion).
    it('laisse passer les lectures d administration d etablissement existantes', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'EstablishmentMembership',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: {
                user: { select: { id: true, email: true } },
                serviceMemberships: { where: { establishmentId: 'e1' }, select: { serviceId: true, role: true } },
              },
            },
          },
          adminStore,
        ),
      ).not.toThrow()
      expect(() =>
        assertTenantScope(
          { model: 'Soignant', operation: 'findMany', args: { where: { establishmentId: 'e1' } } },
          adminStore,
        ),
      ).not.toThrow()
    })
  })

  // Tache 9 / etape 3 : le garde-fou descend desormais dans les inclusions imbriquees, a
  // n'importe quelle profondeur, depuis une racine de service ou d'etablissement — pas
  // seulement au premier niveau depuis une racine d'etablissement (bloc precedent). Preuve
  // attendue par le brief de la tache : la chaine appointment > appointmentPatients > patient >
  // serviceFiles, seule chaine ETABLISSEMENT -> SERVICE effectivement franchissable en pratique
  // (revue tache 6) avant ce correctif, passait sans filtre ; elle est refusee apres. Les autres
  // it() de ce describe eprouvent chacune des chaines nommees par l'ancien commentaire de limite
  // (git history sur assertNestedInclude), une par une.
  describe('descente recursive dans les inclusions imbriquees (tache 9)', () => {
    // LA PREUVE : avant cette tache, cette meme requete ne levait AUCUNE erreur — le sous-dossier
    // de service de TOUS les services etait ramene par une lecture qui ne part meme pas de
    // Patient. C'est exactement la fuite documentee par la limite retiree de tenant-guard.ts.
    it('refuse appointment > appointmentPatients > patient > serviceFiles sans filtre', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: { patient: { include: { serviceFiles: true } } },
                },
              },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('accepte la meme chaine filtree sur le service courant', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: {
                    patient: { include: { serviceFiles: { where: { serviceId: 's1' } } } },
                  },
                },
              },
            },
          },
          store,
        ),
      ).not.toThrow()
    })

    it('refuse patient > pathwayPriorities atteint par la meme chaine imbriquee', () => {
      const chain = (filtered: boolean) =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: {
                    patient: {
                      include: {
                        pathwayPriorities: filtered ? { where: { serviceId: 's1' } } : true,
                      },
                    },
                  },
                },
              },
            },
          },
          store,
        )
      expect(() => chain(false)).toThrow(TenantScopeMissingError)
      expect(() => chain(true)).not.toThrow()
    })

    it('refuse patient > appointmentPatients atteint par la meme chaine imbriquee', () => {
      const chain = (filtered: boolean) =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: {
                    patient: {
                      include: {
                        appointmentPatients: filtered ? { where: { serviceId: 's1' } } : true,
                      },
                    },
                  },
                },
              },
            },
          },
          store,
        )
      expect(() => chain(false)).toThrow(TenantScopeMissingError)
      expect(() => chain(true)).not.toThrow()
    })

    it('refuse soignant > todos atteint par todo > soignant', () => {
      const chain = (filtered: boolean) =>
        assertTenantScope(
          {
            model: 'Todo',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                soignant: {
                  include: { todos: filtered ? { where: { serviceId: 's1' } } : true },
                },
              },
            },
          },
          store,
        )
      expect(() => chain(false)).toThrow(TenantScopeMissingError)
      expect(() => chain(true)).not.toThrow()
    })

    it('refuse soignant > todos atteint par thematic > soignantLinks > soignant', () => {
      const chain = (filtered: boolean) =>
        assertTenantScope(
          {
            model: 'Thematic',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                soignantLinks: {
                  include: {
                    soignant: {
                      include: { todos: filtered ? { where: { serviceId: 's1' } } : true },
                    },
                  },
                },
              },
            },
          },
          store,
        )
      expect(() => chain(false)).toThrow(TenantScopeMissingError)
      expect(() => chain(true)).not.toThrow()
    })

    it('refuse location > slotTemplates atteint par slotTemplate > location', () => {
      const chain = (filtered: boolean) =>
        assertTenantScope(
          {
            model: 'SlotTemplate',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                location: {
                  include: { slotTemplates: filtered ? { where: { serviceId: 's1' } } : true },
                },
              },
            },
          },
          store,
        )
      expect(() => chain(false)).toThrow(TenantScopeMissingError)
      expect(() => chain(true)).not.toThrow()
    })

    // Une fois serviceFiles correctement filtre (etablissement -> service, seule transition
    // dangereuse), descendre plus loin dans serviceFiles > diagnostics (service -> service, pas
    // de nouvelle transition) ne doit PAS exiger de second filtre : la regle est locale a chaque
    // transition, pas cumulative sur toute la profondeur restante.
    it('accepte serviceFiles > diagnostics une fois serviceFiles filtre, sans exigence supplementaire', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: {
                    patient: {
                      include: {
                        serviceFiles: {
                          where: { serviceId: 's1' },
                          include: { diagnostics: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          store,
        ),
      ).not.toThrow()
    })

    // Echec ferme : une relation non declaree en profondeur (pas seulement au premier niveau)
    // est refusee, jamais traversee en silence — c'est le mode de defaillance que la recursion
    // devait eviter d'introduire (consigne 4 : pas de sortie silencieuse sur un modele ou une
    // relation inconnus).
    it('refuse une relation imbriquee non declaree, a n importe quelle profondeur', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: { patient: { include: { relationFuture: true } } },
                },
              },
            },
          },
          store,
        ),
      ).toThrow(/MODEL_RELATIONS/)
    })

    // Non-regression : les chaines reellement utilisees par les repositories (qui s'arretent
    // toutes sur le patient, le soignant ou le lieu, sans redescendre) continuent de passer sans
    // filtre — elles ne franchissent jamais etablissement -> service.
    it('laisse passer les chaines reelles du depot qui ne redescendent pas', () => {
      // appointment.repository.ts : appointmentInclude.
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                thematic: true,
                appointmentPatients: { include: { patient: true } },
              },
            },
          },
          store,
        ),
      ).not.toThrow()

      // slot-template.include.ts : slotTemplateInclude.
      expect(() =>
        assertTenantScope(
          {
            model: 'SlotTemplate',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                soignantLinks: { include: { soignant: true } },
                template: true,
                location: true,
                thematic: true,
              },
            },
          },
          store,
        ),
      ).not.toThrow()

      // pathway.repository.ts : slotsWithTemplateInclude, la chaine la plus profonde du depot.
      expect(() =>
        assertTenantScope(
          {
            model: 'Pathway',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                slots: {
                  include: {
                    slotTemplate: { include: { soignantLinks: { include: { soignant: true } } } },
                    appointments: {
                      include: { appointmentPatients: { include: { patient: true } } },
                    },
                  },
                },
              },
            },
          },
          store,
        ),
      ).not.toThrow()
    })
  })

  // Tour de correction 1 sur la relecture de la tache 9, important 2 : `_count` sous `select`
  // echappait au controle la ou il est refuse sous `include` (non declare dans MODEL_RELATIONS,
  // donc refuse la-bas ; sous `select`, une cle non declaree est ignoree en silence par
  // construction, puisque `select` mele colonnes scalaires et relations). `_count` n'est ni l'un
  // ni l'autre : c'est un mot reserve de Prisma. Fuite de cardinalite seule (pas de contenu) :
  // "ce patient a N dossiers de service" revele qu'il est suivi ailleurs, sans dire ou — demontre
  // contre une vraie base (tache 9, revue, Important 2) avec un patient ayant un dossier dans
  // deux services, ou `_count.serviceFiles` valait 2 pour un tenant scope au seul service A1.
  describe('_count sous select (tour de correction 1, important 2)', () => {
    it('refuse _count sous select comme sous include, a la racine', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              select: { lastName: true, _count: { select: { serviceFiles: true } } },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: {
              where: { establishmentId: 'e1' },
              include: { _count: { select: { serviceFiles: true } } },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    // La forme raccourcie `_count: true` (compte TOUTES les relations) est au moins aussi
    // dangereuse que la forme cible, et doit etre refusee de la meme facon.
    it('refuse _count: true sous select', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Patient',
            operation: 'findMany',
            args: { where: { establishmentId: 'e1' }, select: { _count: true } },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    // La recursion etend la portee du probleme a n'importe quelle profondeur : verifie ici sur
    // la meme chaine imbriquee que la tache 9 (appointment > appointmentPatients > patient).
    it('refuse _count sous select en profondeur, atteint par la meme chaine imbriquee', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'Appointment',
            operation: 'findMany',
            args: {
              where: { serviceId: 's1' },
              include: {
                appointmentPatients: {
                  include: {
                    patient: {
                      select: { lastName: true, _count: { select: { serviceFiles: true } } },
                    },
                  },
                },
              },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })
  })

  // Tour de correction 1 sur la relecture de la tache 9 : assertNestedInclude n'etait jamais
  // appelee pour une racine globale (voir l'ancien commentaire « PERIMETRE NON COUVERT » retire
  // de tenant-guard.ts). Une lecture qui franchissait assertGlobalInclude (une seule ligne, via
  // findUnique(OrThrow)) pouvait ensuite descendre sans plus aucun filtre jusqu'a une transition
  // etablissement -> service. Prouve contre une vraie base (tache 9, revue, point A6) : un compte
  // membre du seul etablissement A lisait medicalDiagnosis et notes d'un patient de
  // l'etablissement B par cette meme chaine, en partant de User.
  describe('descente recursive depuis une racine globale (tour de correction 1)', () => {
    const dangerousChain = {
      establishmentMemberships: {
        include: {
          establishment: {
            include: { patients: { include: { serviceFiles: true } } },
          },
        },
      },
    }
    const filteredChain = {
      establishmentMemberships: {
        include: {
          establishment: {
            include: {
              patients: {
                include: { serviceFiles: { where: { serviceId: 's1' } } },
              },
            },
          },
        },
      },
    }

    it('refuse User > establishmentMemberships > establishment > patients > serviceFiles sans filtre', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'User',
            operation: 'findUniqueOrThrow',
            args: { where: { id: 'u1' }, include: dangerousChain },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('accepte la meme chaine filtree sur le service courant', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'User',
            operation: 'findUniqueOrThrow',
            args: { where: { id: 'u1' }, include: filteredChain },
          },
          store,
        ),
      ).not.toThrow()
    })

    // Le chemin de connexion : verifySessionCookie appelle userDomain.findByID ->
    // user.findUniqueOrThrow({ include: membershipsInclude }), et tenantContext.clear() tourne
    // juste avant (routes/index.ts) — donc SANS aucun tenant en contexte. L'inclusion reelle de
    // user.repository.ts (establishmentMemberships > { establishment, serviceMemberships >
    // service }) ne franchit jamais etablissement -> service : ServiceMembership et Service sont
    // tous deux en famille etablissement (voir MODEL_RELATIONS). Elle doit donc rester verte,
    // avec ou sans tenant — c'est precisement la lecture que la fermeture de la limite risquait
    // de casser.
    it('laisse passer le chemin de connexion (include reel de user.repository.ts), sans tenant', () => {
      const membershipsInclude = {
        establishmentMemberships: {
          include: {
            establishment: true,
            serviceMemberships: { include: { service: true } },
          },
        },
      }
      expect(() =>
        assertTenantScope(
          {
            model: 'User',
            operation: 'findUniqueOrThrow',
            args: { where: { id: 'u1' }, include: membershipsInclude },
          },
          undefined,
        ),
      ).not.toThrow()
      // findByEmail (login) : aucun include du tout.
      expect(() =>
        assertTenantScope(
          { model: 'User', operation: 'findUniqueOrThrow', args: { where: { email: 'a@b.c' } } },
          undefined,
        ),
      ).not.toThrow()
    })

    // Echec ferme : sans tenant en contexte, une descente qui atteint quand meme une transition
    // etablissement -> service est refusee, jamais laissee passer par defaut faute de valeur a
    // comparer.
    it('refuse la meme transition dangereuse quand la lecture n a aucun tenant en contexte', () => {
      expect(() =>
        assertTenantScope(
          {
            model: 'User',
            operation: 'findUniqueOrThrow',
            args: { where: { id: 'u1' }, include: dangerousChain },
          },
          undefined,
        ),
      ).toThrow(TenantScopeMissingError)
    })
  })
})

describe('contexte superadmin', () => {
  const store = { kind: 'superadmin' } as const

  it('autorise une operation declaree', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Service', operation: 'count', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse une operation non declaree sur le meme modele', () => {
    expect(() =>
      assertTenantScope({ model: 'Service', operation: 'deleteMany', args: {} }, store),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse un modele absent de la liste, meme en lecture', () => {
    expect(() =>
      assertTenantScope({ model: 'Patient', operation: 'findMany', args: {} }, store),
    ).toThrow(TenantScopeMissingError)
  })

  it('autorise le comptage des patients, qui est declare', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Patient', operation: 'count', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })

  // TOUR DE CORRECTION 1 (tache 1) — Critique 1 de la revue : la premiere version de la branche
  // superadmin faisait `return` juste apres la porte de permission, sautant toute la descente
  // structurelle (assertNestedInclude, assertData -> assertNestedRelations) prouvee a l'etape 3.
  // Les trois cas ci-dessous sont ceux nommes par la revue ; chacun doit rester refuse APRES le
  // correctif (assertSuperAdminOperationDeclared ne fait plus sortir la fonction), et le dernier
  // test du bloc verifie l'autre sens : une operation declaree SANS inclusion imbriquee doit
  // continuer a passer, sans quoi le correctif aurait ferme la liste en la rendant inutilisable.
  describe('la descente structurelle reste active sous superadmin (revue, tour 1)', () => {
    it('refuse Service.findMany decore d une inclusion qui descend jusqu a Patient', () => {
      // Service (etablissement) -> patientServiceFiles (service) -> patient (etablissement),
      // diagnostics et enrollmentIssues (donnees cliniques). La transition etablissement ->
      // service, au premier saut, doit deja refuser : le superadmin n'a pas de service courant
      // par lequel filtrer (assertServiceRelationFilter).
      expect(() =>
        assertTenantScope(
          {
            model: 'Service',
            operation: 'findMany',
            args: {
              include: {
                patientServiceFiles: {
                  include: { patient: true, diagnostics: true, enrollmentIssues: true },
                },
              },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse EstablishmentMembership.create avec une ecriture imbriquee vers un autre modele de tenant', () => {
      // La ligne de tete (userId/establishmentId/role) est declaree et doit rester libre — c'est
      // le create nu, teste plus bas, qui le prouve. Ce qui doit etre refuse ici est la relation
      // imbriquee serviceMemberships (declaree dans NESTED_RELATIONS), qui retombe sur un nouvel
      // appel a assertData — donc a assertRowScope, qui compare a un tenant ambiant que le
      // superadmin n'a pas.
      expect(() =>
        assertTenantScope(
          {
            model: 'EstablishmentMembership',
            operation: 'create',
            args: {
              data: {
                userId: 'u1',
                establishmentId: 'e1',
                role: 'MEMBER',
                serviceMemberships: {
                  create: [{ serviceId: 's1', establishmentId: 'e1', role: 'INTERVENANT' }],
                },
              },
            },
          },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('refuse _count sous select, comme pour le contexte tenant', () => {
      expect(() =>
        assertTenantScope(
          { model: 'Service', operation: 'findMany', args: { select: { _count: true } } },
          store,
        ),
      ).toThrow(TenantScopeMissingError)
    })

    it('laisse toujours passer une operation declaree sans inclusion imbriquee', () => {
      // L'autre sens, explicitement demande par la revue : le correctif ne doit pas fermer la
      // liste au point de la rendre inutilisable. Une lecture nue et une ecriture plate (sans
      // relation imbriquee) doivent rester vertes.
      expect(() =>
        assertTenantScope({ model: 'Service', operation: 'findMany', args: {} }, store),
      ).not.toThrow()
      expect(() =>
        assertTenantScope(
          {
            model: 'EstablishmentMembership',
            operation: 'create',
            args: { data: { userId: 'u1', establishmentId: 'e1', role: 'MEMBER' } },
          },
          store,
        ),
      ).not.toThrow()
    })
  })
})

// Preuve de monotonie (tache 1, step 7) : le resserrement de l'etape 3 n'avait perdu aucun refus
// (6 649 chemins enumeres, comparaison des deux versions du garde-fou — voir
// docs/multi-tenant/decisions-etape-3.md). Le troisieme contexte doit tenir la meme propriete
// pour les deux contextes preexistants.
//
// Choix retenu ici entre les deux options du brief : OPTION A (rejouer un echantillon avant et
// apres le changement), pas l'option B (importer les deux versions du fichier cote a cote).
// Raison : le diff de cette tache sur assertTenantScope ajoute une nouvelle table
// (SUPERADMIN_OPERATIONS) et deux fonctions, et remplace UNE seule ligne preexistante —
// `if (store.kind === 'system') { return }` devient `if (isNonTenantStore(store)) {
// assertNonTenantStore(store, model, operation); return }` (extraction exigee par le linter,
// complexite cognitive de assertTenantScope sinon au-dessus du seuil). Ce remplacement est
// verifie sans changement de comportement pour store.kind === 'system' : `assertNonTenantStore`
// ne fait rien pour ce cas (seule sa branche `superadmin` a un corps), donc la ligne se comporte
// exactement comme avant — un retour immediat, sans effet — pour tout appel qui l'atteignait deja.
// Aucune autre ligne du chemin tenant (family etablissement/service, plus bas dans la fonction)
// n'est touchee. Importer une seconde copie complete de tenant-guard.ts (plus de 800 lignes, cinq
// tables ecrites a la main) comme fixture figee aurait ajoute, dans le fichier dont un defaut
// ouvre l'acces a des donnees de sante sans bruit, une duplication permanente que rien n'oblige a
// garder synchronisee — le risque que ce meme fichier documente deja pour un autre arbitrage (voir
// le commentaire de MODEL_RELATIONS). Prouver une fois, a l'ecriture, suffit pour un changement
// aussi etroit.
//
// Cette preuve a ete faite empiriquement, pas seulement argumentee : la version de
// tenant-guard.ts telle qu'elle existait juste avant cette tache (commit e06d057) a ete remise en
// place temporairement (copie de cote puis restauree, jamais de `git stash`) et ce meme bloc de
// cas a ete rejoue contre elle — memes verdicts. Voir le rapport de tache pour la trace de cette
// epreuve ; elle n'est pas gardee ici en permanence, pour la raison ci-dessus.
describe('monotonie : le contexte superadmin ne change aucun verdict pour tenant et system', () => {
  const casTenantEtSysteme: Array<{
    nom: string
    store: TenantStore | undefined
    model: string
    operation: string
    args: Record<string, unknown>
    attendu: 'passe' | 'refuse'
  }> = [
    {
      nom: 'tenant, modele de service, lecture avec serviceId',
      store,
      model: 'Slot',
      operation: 'findMany',
      args: { where: { serviceId: 's1' } },
      attendu: 'passe',
    },
    {
      nom: 'tenant, modele de service, lecture sans serviceId',
      store,
      model: 'Slot',
      operation: 'findMany',
      args: { where: {} },
      attendu: 'refuse',
    },
    {
      nom: 'tenant, modele d etablissement, lecture avec establishmentId',
      store,
      model: 'Patient',
      operation: 'findMany',
      args: { where: { establishmentId: 'e1' } },
      attendu: 'passe',
    },
    {
      nom: 'tenant, modele d etablissement, lecture sans establishmentId',
      store,
      model: 'Patient',
      operation: 'findMany',
      args: { where: {} },
      attendu: 'refuse',
    },
    {
      nom: 'tenant, modele global, sans filtre',
      store,
      model: 'User',
      operation: 'findMany',
      args: {},
      attendu: 'passe',
    },
    {
      nom: 'tenant, include de relation de tenant sur Establishment hors findUnique',
      store,
      model: 'Establishment',
      operation: 'findMany',
      args: { include: { patients: true } },
      attendu: 'refuse',
    },
    {
      nom: 'tenant, meme include mais sous findUnique(id) — une seule ligne',
      store,
      model: 'Establishment',
      operation: 'findUnique',
      args: { where: { id: 'e1' }, include: { patients: true } },
      attendu: 'passe',
    },
    {
      nom: 'tenant, service sous un tenant sans service (adminStore)',
      store: adminStore,
      model: 'Slot',
      operation: 'findMany',
      args: { where: { serviceId: 's1' } },
      attendu: 'refuse',
    },
    {
      nom: 'system, ecriture large sans filtre',
      store: { kind: 'system' },
      model: 'ActivityLog',
      operation: 'deleteMany',
      args: { where: {} },
      attendu: 'passe',
    },
    {
      nom: 'system, modele de service sans filtre',
      store: { kind: 'system' },
      model: 'Slot',
      operation: 'findMany',
      args: { where: {} },
      attendu: 'passe',
    },
    {
      nom: 'sans contexte, modele global, lecture unique',
      store: undefined,
      model: 'User',
      operation: 'findUnique',
      args: { where: { id: 'u' } },
      attendu: 'passe',
    },
    {
      nom: 'sans contexte, modele de service',
      store: undefined,
      model: 'Slot',
      operation: 'findMany',
      args: { where: { serviceId: 's1' } },
      attendu: 'refuse',
    },
  ]

  it.each(casTenantEtSysteme)('$nom', ({ store: storeDuCas, model, operation, args, attendu }) => {
    const appel = () => assertTenantScope({ model, operation, args }, storeDuCas)
    if (attendu === 'passe') {
      expect(appel).not.toThrow()
    } else {
      expect(appel).toThrow(TenantScopeMissingError)
    }
  })
})

// TOUR DE CORRECTION 2 (tache 1) — Critique 1 de la revue : un modele GLOBAL sert de pont.
// `Service.findMany({ include: { establishment: { include: { patients: true } } } })` passait :
// la transition etablissement -> service (assertServiceRelationFilter) ne dit rien d'une
// relation vers un modele global, ni d'une relation qui en repart. Voir le commentaire de
// assertNoGlobalBridgeUnderSuperAdmin (tenant-guard.ts) pour le detail du remede et pourquoi il
// reste local au contexte superadmin (le contexte tenant est protege par le `where` de sa
// racine, jamais pose sous superadmin — sauf par une relation A-PLUSIEURS d'un modele global,
// qui reste un trou preexistant non traite ici, voir le meme commentaire, tour 3).
//
// TOUR DE CORRECTION 3 — Critique : une racine GLOBALE contournait ENTIEREMENT la liste, puisque
// `assertTenantScope` retourne via `assertGlobalScope` avant meme d'atteindre la porte de
// permission. `Establishment.findUnique({ include: { patients: true } })` et
// `Establishment.deleteMany({})` passaient tous deux. La recherche ci-dessous porte donc
// maintenant aussi sur les racines globales (`User`, `Establishment`), pas seulement sur les
// racines declarees dans SUPERADMIN_OPERATIONS.
describe('aucun pont par un modele global sous superadmin (revue, tours 2 et 3)', () => {
  const store = { kind: 'superadmin' } as const

  type Famille = 'service' | 'etablissement' | 'global'
  const familleDe = (modele: string): Famille => {
    if (SERVICE_MODELS.includes(modele)) {
      return 'service'
    }
    if (ESTABLISHMENT_MODELS.includes(modele)) {
      return 'etablissement'
    }
    return 'global'
  }

  // Construit l'objet `include` imbrique qui suit exactement `chemin` (une liste de noms de
  // champ de relation), jusqu'a une valeur terminale `true`.
  const includeDuChemin = (chemin: readonly string[]): Record<string, unknown> => {
    const [tete, ...reste] = chemin
    if (tete === undefined) {
      return {}
    }
    return reste.length === 0 ? { [tete]: true } : { [tete]: { include: includeDuChemin(reste) } }
  }

  // Parcours en largeur de MODEL_RELATIONS depuis `racine`, jusqu'a une profondeur bornee — ce
  // graphe porte des cycles (Slot <-> Appointment, Pathway <-> Slot...), la profondeur est donc
  // la seule garde necessaire, pas un ensemble de visites. Chaque chemin retenu s'arrete au
  // PREMIER saut qui franchit la frontiere global/tenant (dans un sens comme dans l'autre — voir
  // TOUR 3 ci-dessus : une racine globale franchit la frontiere des le premier saut, pas apres
  // avoir atteint un modele global en profondeur, puisqu'elle EST deja ce modele) : c'est le
  // point exact ou assertNoGlobalBridgeUnderSuperAdmin doit refuser, et un chemin plus long
  // derriere lui ne serait de toute facon jamais atteint — la recursion de assertNestedInclude
  // s'arrete au premier throw.
  const cheminsQuiFranchissentLaFrontiereGlobale = (racine: string, profondeurMax: number): string[][] => {
    const resultats: string[][] = []
    const file: Array<{ modele: string; chemin: string[] }> = [{ modele: racine, chemin: [] }]
    while (file.length > 0) {
      const courant = file.shift()
      if (!courant || courant.chemin.length >= profondeurMax) {
        continue
      }
      for (const [relationField, cible] of Object.entries(MODEL_RELATIONS[courant.modele] ?? {})) {
        const nouveauChemin = [...courant.chemin, relationField]
        const franchit = (familleDe(courant.modele) === 'global') !== (familleDe(cible) === 'global')
        if (franchit) {
          resultats.push(nouveauChemin)
          continue
        }
        file.push({ modele: cible, chemin: nouveauChemin })
      }
    }
    return resultats
  }

  // Les seuls modeles declares avec `findMany` (count ne prend pas d'`include` en Prisma, donc
  // Patient — qui n'a que `count` — ne peut pas servir de racine a une chaine d'inclusion).
  const racinesAvecInclude = Object.entries(SUPERADMIN_OPERATIONS)
    .filter(([, operations]) => operations.includes('findMany'))
    .map(([modele]) => modele)

  // Les deux racines globales (tour 3) : declarees en lecture dans SUPERADMIN_GLOBAL_OPERATIONS
  // (tenant-guard.ts), donc des racines tout aussi legitimes qu'un modele de tenant declare.
  // `findUnique` plutot que `findMany` : assertGlobalInclude bloque deja `findMany` + un include
  // vers une relation de GLOBAL_TENANT_RELATIONS, independamment de cette recherche — c'est
  // precisement le cas (`findUnique`, autorise par assertGlobalInclude) que la revue a cite, et
  // c'est lui qui isole vraiment ce que assertNoGlobalBridgeUnderSuperAdmin doit refuser seul.
  //
  // TOUR DE CORRECTION 4 — `create` s'y ajoute, pour la meme raison qu'au tour 3 : ce tour rend
  // `User.create` et `Establishment.create` PERMIS sous superadmin, donc ces deux couples
  // deviennent a leur tour des racines depuis lesquelles une chaine d'inclusion pourrait franchir
  // la frontiere (`create ... include` rend exactement ce qu'un `findMany ... include` rendrait).
  // Le balayage doit donc repartir de la, sans quoi l'elargissement de ce tour rouvrirait
  // precisement ce que le tour 3 a ferme.
  const racinesGlobales: Array<{ racine: string; operation: string; base: Record<string, unknown> }> = [
    { racine: 'User', operation: 'findUnique', base: { where: { id: 'x1' } } },
    { racine: 'Establishment', operation: 'findUnique', base: { where: { id: 'x1' } } },
    { racine: 'User', operation: 'create', base: { data: {} } },
    { racine: 'Establishment', operation: 'create', base: { data: {} } },
  ]

  it('part bien de plus d un modele (sinon le test suivant ne cherche presque rien)', () => {
    expect(racinesAvecInclude.length).toBeGreaterThanOrEqual(3)
    expect(racinesGlobales.map(({ racine }) => racine).sort()).toEqual([
      'Establishment',
      'Establishment',
      'User',
      'User',
    ])
  })

  // Le coeur de l'epreuve demandee par la revue : chercher la chaine qui passe encore, pas
  // seulement verifier que l'exemple cite echoue — et, au tour 3, depuis une racine globale
  // comme depuis les autres. Le tableau des violations (vide si tout est refuse) s'affiche dans
  // le diff Jest en cas d'echec, avec la racine et le chemin exact qui aurait fui.
  it('refuse toute chaine qui franchit la frontiere globale/tenant, depuis chaque racine — declaree ou globale —, a toute profondeur', () => {
    const violations: { racine: string; operation: string; chemin: string[] }[] = []
    const racinesEtOperations: Array<{ racine: string; operation: string; base: Record<string, unknown> }> = [
      ...racinesAvecInclude.map((racine) => ({ racine, operation: 'findMany', base: {} })),
      ...racinesGlobales,
    ]
    for (const { racine, operation, base } of racinesEtOperations) {
      for (const chemin of cheminsQuiFranchissentLaFrontiereGlobale(racine, 5)) {
        const args: Record<string, unknown> = { ...base, include: includeDuChemin(chemin) }
        try {
          assertTenantScope({ model: racine, operation, args }, store)
          violations.push({ racine, operation, chemin })
        } catch (erreur) {
          if (!(erreur instanceof TenantScopeMissingError)) {
            throw erreur
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  // Les deux exemples nommes par la revue, gardes tels quels en plus de la recherche ci-dessus :
  // un echec de lecture isole sur ces cas precis doit rester lisible sans avoir a interpreter un
  // tableau de violations.
  it('refuse Service.findMany -> establishment -> patients, l exemple cite au tour 2', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Service',
          operation: 'findMany',
          args: { include: { establishment: { include: { patients: true } } } },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse Establishment.findUnique -> patients, l exemple cite au tour 3', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Establishment',
          operation: 'findUnique',
          args: { where: { id: 'e1' }, include: { patients: true } },
        },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse Establishment.deleteMany, l autre exemple cite au tour 3', () => {
    expect(() => assertTenantScope({ model: 'Establishment', operation: 'deleteMany', args: {} }, store)).toThrow(
      TenantScopeMissingError,
    )
  })

  // L'autre sens, explicitement demande par la revue : le correctif ne doit pas avoir referme
  // plus que necessaire. Les dix couples declares (SUPERADMIN_OPERATIONS), nus et avec un
  // `where` libre, doivent tous continuer a passer — et, depuis le tour 3, une lecture NUE (sans
  // include) d'une racine globale doit rester possible : c'est le contournement documente
  // au-dessus de SUPERADMIN_OPERATIONS (deux lectures separees, jointure en memoire) pour les
  // taches 6, 7 et 9.
  it('laisse passer les dix couples declares, nus et avec un where libre, et les lectures nues de User/Establishment', () => {
    const casDeclares: Array<{ model: string; operation: string; args: Record<string, unknown> }> = [
      { model: 'Service', operation: 'count', args: {} },
      { model: 'Service', operation: 'count', args: { where: { establishmentId: 'e1' } } },
      { model: 'Service', operation: 'findMany', args: {} },
      { model: 'Service', operation: 'findMany', args: { where: { establishmentId: 'e1' } } },
      { model: 'EstablishmentMembership', operation: 'count', args: {} },
      { model: 'EstablishmentMembership', operation: 'findMany', args: {} },
      {
        model: 'EstablishmentMembership',
        operation: 'create',
        args: { data: { userId: 'u1', establishmentId: 'e1', role: 'MEMBER' } },
      },
      { model: 'ServiceMembership', operation: 'count', args: {} },
      { model: 'ServiceMembership', operation: 'findMany', args: {} },
      { model: 'Patient', operation: 'count', args: {} },
      { model: 'Patient', operation: 'count', args: { where: { establishmentId: 'e1' } } },
      { model: 'ActivityLog', operation: 'findMany', args: {} },
      { model: 'ActivityLog', operation: 'count', args: {} },
      // Le contournement sûr documenté au-dessus de SUPERADMIN_OPERATIONS : lectures nues,
      // aucun `include` vers l'autre côté du pont.
      { model: 'User', operation: 'findMany', args: {} },
      { model: 'User', operation: 'findMany', args: { where: { id: { in: ['u1', 'u2'] } } } },
      { model: 'Establishment', operation: 'findMany', args: {} },
      { model: 'Establishment', operation: 'findUnique', args: { where: { id: 'e1' } } },
    ]
    for (const cas of casDeclares) {
      expect(() => assertTenantScope(cas, store)).not.toThrow()
    }
  })
})

// TOUR DE CORRECTION 4 (tache 1) — Critique de la re-revue : le resserrement du tour 3 avait ferme
// dix-huit couples (modele, operation) d'ecriture sur un modele global, dont ceux dont les taches
// 4, 6, 8 et 10 dependent, et il n'existait AUCUNE porte declarative pour en rouvrir un seul (un
// modele global n'atteint jamais SUPERADMIN_OPERATIONS ; l'ancien ensemble n'avait pas de
// granularite par modele). SUPERADMIN_GLOBAL_OPERATIONS est cette porte. Ce bloc l'eprouve dans
// les DEUX sens, et le second compte autant que le premier : ce dont le plan a besoin passe, et
// tout le reste — mutations non declarees, modeles globaux non declares, ecritures imbriquees sous
// un `data` pourtant declare — reste refuse.
describe('ecritures declarees sur un modele global sous superadmin (revue, tour 4)', () => {
  const store = { kind: 'superadmin' } as const
  // Le store de tenant ordinaire, pour la contrepartie de monotonie en fin de bloc (le `store`
  // du module est masque ici par celui du superadmin).
  const storeTenant: TenantStore = {
    kind: 'tenant',
    tenant: {
      userId: 'u1',
      establishmentId: 'e1',
      establishmentRole: 'MEMBER',
      serviceId: 's1',
      serviceRole: 'INTERVENANT',
      soignantId: null,
    },
  }

  // Ce dont les quatre taches ont besoin, nomme une par une plutot que par un balayage : un echec
  // ici doit dire QUELLE tache se retrouve bloquee.
  const besoinsDesTaches: Array<{ tache: string; model: string; operation: string; args: Record<string, unknown> }> = [
    {
      tache: 'tache 6 — creer un etablissement',
      model: 'Establishment',
      operation: 'create',
      args: { data: { name: 'CH de Test' } },
    },
    {
      tache: 'taches 6 et 10 — creer un compte',
      model: 'User',
      operation: 'create',
      args: { data: { email: 'a@b.c', firstName: 'A', lastName: 'B', password: 'x' } },
    },
    {
      tache: 'taches 6 et 10 — l adresse deja connue : lire avant de creer, sans ecraser',
      model: 'User',
      operation: 'findUnique',
      args: { where: { email: 'a@b.c' } },
    },
    {
      tache: 'taches 4, 6 et 10 — emettre un lien d acces',
      model: 'AccessLink',
      operation: 'create',
      args: { data: { userId: 'u1', tokenHash: 'h', createdBy: 'u0', expiresAt: new Date() } },
    },
    {
      tache: 'tache 4 — la reemission invalide les liens precedents du meme compte',
      model: 'AccessLink',
      operation: 'updateMany',
      args: { where: { userId: 'u1', usedAt: null }, data: { usedAt: new Date() } },
    },
    {
      tache: 'tache 8 — octroyer un acces temporaire',
      model: 'SuperAdminAccessGrant',
      operation: 'create',
      args: { data: { userId: 'u1', establishmentId: 'e1', reason: 'incident', expiresAt: new Date() } },
    },
    {
      // La revue attendait ici `.delete`. Le modele porte `revokedAt DateTime?` (specification §5)
      // et la tache 8 step 4 exige que l'administrateur voie les octrois « en cours ET PASSES,
      // avec leur motif et leur auteur » : supprimer la ligne detruirait la trace comptable qui
      // justifie le mecanisme. Revoquer est donc un `update`, et c'est lui qui est declare.
      tache: 'tache 8 — revoquer un octroi (revokedAt, pas un delete)',
      model: 'SuperAdminAccessGrant',
      operation: 'update',
      args: { where: { id: 'g1' }, data: { revokedAt: new Date() } },
    },
    {
      tache: 'tache 7 — lister les etablissements',
      model: 'Establishment',
      operation: 'findMany',
      args: {},
    },
    {
      tache: 'tache 7 — chercher un compte par son adresse',
      model: 'User',
      operation: 'findMany',
      args: { where: { email: { contains: 'a@b.c' } } },
    },
  ]

  it.each(besoinsDesTaches)('laisse passer $tache — $model / $operation', ({ model, operation, args }) => {
    expect(() => assertTenantScope({ model, operation, args }, store)).not.toThrow()
  })

  // L'autre sens, celui qui compte autant : l'elargissement ne doit rien rouvrir d'autre. Chaque
  // couple ci-dessous est une mutation que le tour 3 avait fermee et que ce tour NE rouvre pas.
  const mutationsNonDeclarees: Array<{ model: string; operation: string; args: Record<string, unknown> }> = [
    { model: 'Establishment', operation: 'deleteMany', args: {} },
    { model: 'Establishment', operation: 'delete', args: { where: { id: 'e1' } } },
    { model: 'Establishment', operation: 'update', args: { where: { id: 'e1' }, data: { name: 'x' } } },
    { model: 'Establishment', operation: 'updateMany', args: { data: { name: 'x' } } },
    { model: 'Establishment', operation: 'upsert', args: { where: { id: 'e1' }, create: {}, update: {} } },
    { model: 'Establishment', operation: 'createMany', args: { data: [{ name: 'x' }] } },
    { model: 'User', operation: 'updateMany', args: { data: { password: 'x' } } },
    { model: 'User', operation: 'update', args: { where: { id: 'u1' }, data: { password: 'x' } } },
    { model: 'User', operation: 'delete', args: { where: { id: 'u1' } } },
    { model: 'User', operation: 'deleteMany', args: {} },
    { model: 'User', operation: 'upsert', args: { where: { id: 'u1' }, create: {}, update: {} } },
    { model: 'User', operation: 'createMany', args: { data: [{ email: 'a@b.c' }] } },
    { model: 'AccessLink', operation: 'delete', args: { where: { id: 'l1' } } },
    { model: 'AccessLink', operation: 'deleteMany', args: {} },
    { model: 'SuperAdminAccessGrant', operation: 'delete', args: { where: { id: 'g1' } } },
    { model: 'SuperAdminAccessGrant', operation: 'deleteMany', args: {} },
    // Un modele global qu'aucune entree ne declare est refuse EN ENTIER, lecture comprise : c'est
    // la difference avec le tour 3, ou tout modele global etait lisible sans declaration.
    { model: 'UnModeleGlobalDeDemain', operation: 'findMany', args: {} },
    { model: 'UnModeleGlobalDeDemain', operation: 'count', args: {} },
    { model: 'UnModeleGlobalDeDemain', operation: 'create', args: { data: {} } },
  ]

  it.each(mutationsNonDeclarees)('refuse $model / $operation, non declare', ({ model, operation, args }) => {
    expect(() => assertTenantScope({ model, operation, args }, store)).toThrow(TenantScopeMissingError)
  })

  // Toute la table, sans exception ecrite a la main : ce que la declaration promet, le garde-fou
  // doit le tenir couple par couple. `count`/`aggregate`/`groupBy` et les ecritures prennent des
  // arguments differents, d'ou la forme minimale construite par operation.
  it('laisse passer chaque couple declare de SUPERADMIN_GLOBAL_OPERATIONS, et rien d autre sur ces modeles', () => {
    const argsMinimaux = (operation: string): Record<string, unknown> => {
      if (operation === 'create') {
        return { data: {} }
      }
      if (operation === 'update' || operation === 'updateMany') {
        return { where: { id: 'x1' }, data: {} }
      }
      if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
        return { where: { id: 'x1' } }
      }
      return {}
    }
    const refusesATort: string[] = []
    for (const [model, operations] of Object.entries(SUPERADMIN_GLOBAL_OPERATIONS)) {
      for (const operation of operations) {
        try {
          assertTenantScope({ model, operation, args: argsMinimaux(operation) }, store)
        } catch {
          refusesATort.push(`${model}.${operation}`)
        }
      }
    }
    expect(refusesATort).toEqual([])

    // Le complement : toute operation connue de Prisma absente de la declaration d'un modele
    // declare reste refusee — c'est ce qui fait de cette table une liste blanche et non une
    // simple documentation.
    const toutesLesOperations = [
      'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
      'count', 'aggregate', 'groupBy',
      'create', 'createMany', 'createManyAndReturn',
      'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany',
    ]
    const passesATort: string[] = []
    for (const [model, operations] of Object.entries(SUPERADMIN_GLOBAL_OPERATIONS)) {
      for (const operation of toutesLesOperations.filter((op) => !operations.includes(op))) {
        try {
          assertTenantScope({ model, operation, args: argsMinimaux(operation) }, store)
          passesATort.push(`${model}.${operation}`)
        } catch (erreur) {
          if (!(erreur instanceof TenantScopeMissingError)) {
            throw erreur
          }
        }
      }
    }
    expect(passesATort).toEqual([])
  })

  // Une ecriture declaree n'ouvre QUE sa propre ligne. Sans cette garde, declarer
  // `Establishment.create` rouvrirait par son `data` le pont vers les modeles de tenant que
  // assertNoGlobalBridgeUnderSuperAdmin ferme du cote `include` — le trou du tour 2, rouvert par
  // l'autre porte.
  const ecrituresImbriquees: Array<{ nom: string; model: string; operation: string; args: Record<string, unknown> }> = [
    {
      nom: 'Establishment.create + patients.create',
      model: 'Establishment',
      operation: 'create',
      args: { data: { name: 'x', patients: { create: { firstName: 'A', lastName: 'B' } } } },
    },
    {
      nom: 'Establishment.create + services.connect',
      model: 'Establishment',
      operation: 'create',
      args: { data: { name: 'x', services: { connect: { id: 's1' } } } },
    },
    {
      nom: 'User.create + establishmentMemberships.create',
      model: 'User',
      operation: 'create',
      args: { data: { email: 'a@b.c', establishmentMemberships: { create: { establishmentId: 'e1' } } } },
    },
    {
      nom: 'AccessLink.create + user.connect',
      model: 'AccessLink',
      operation: 'create',
      args: { data: { tokenHash: 'h', user: { connect: { id: 'u1' } } } },
    },
    {
      nom: 'AccessLink.updateMany + user.connect',
      model: 'AccessLink',
      operation: 'updateMany',
      args: { where: { userId: 'u1' }, data: { user: { connect: { id: 'u2' } } } },
    },
    {
      nom: 'SuperAdminAccessGrant.update + establishment.connect',
      model: 'SuperAdminAccessGrant',
      operation: 'update',
      args: { where: { id: 'g1' }, data: { establishment: { connect: { id: 'e2' } } } },
    },
    {
      nom: 'Establishment.create + include patients',
      model: 'Establishment',
      operation: 'create',
      args: { data: { name: 'x' }, include: { patients: true } },
    },
    {
      nom: 'User.create + select establishmentMemberships',
      model: 'User',
      operation: 'create',
      args: { data: { email: 'a@b.c' }, select: { establishmentMemberships: true } },
    },
  ]

  it.each(ecrituresImbriquees)('refuse $nom : une ecriture declaree n ouvre que sa propre ligne', ({ model, operation, args }) => {
    expect(() => assertTenantScope({ model, operation, args }, store)).toThrow(TenantScopeMissingError)
  })

  // Et la contrepartie de monotonie, a l'echelle de ce bloc : ce tour n'a rien change hors du
  // contexte superadmin. Les memes couples, sous tenant et sans contexte, rendent le meme verdict
  // qu'avant — un modele global n'y est soumis a aucune des deux tables.
  it('ne change aucun verdict hors du contexte superadmin', () => {
    const casHorsSuperadmin: Array<{ model: string; operation: string; args: Record<string, unknown> }> = [
      { model: 'Establishment', operation: 'create', args: { data: { name: 'x' } } },
      { model: 'Establishment', operation: 'deleteMany', args: {} },
      { model: 'User', operation: 'updateMany', args: { data: { password: 'x' } } },
      { model: 'UnModeleGlobalDeDemain', operation: 'findMany', args: {} },
    ]
    for (const cas of casHorsSuperadmin) {
      expect(() => assertTenantScope(cas, storeTenant)).not.toThrow()
      expect(() => assertTenantScope(cas, undefined)).not.toThrow()
      expect(() => assertTenantScope(cas, { kind: 'system' })).not.toThrow()
    }
  })
})
