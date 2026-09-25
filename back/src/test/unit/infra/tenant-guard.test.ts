import { assertTenantScope } from '../../../main/infra/orm/tenant-guard'
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
