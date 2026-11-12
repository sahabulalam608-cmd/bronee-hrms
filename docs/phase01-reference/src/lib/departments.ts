export type Department = {
  id: string
  name: string
  type: 'regular' | 'parent' | 'protected'
  subDepartments?: { id: string; name: string }[]
}

export const DEPARTMENTS: Department[] = [
  { id: 'supply-chain', name: 'Supply Chain', type: 'regular' },
  { id: 'digital-marketing', name: 'Digital Marketing', type: 'regular' },
  { id: 'accounts', name: 'Accounts', type: 'regular' },
  {
    id: 'sales-team',
    name: 'Sales Team',
    type: 'parent',
    subDepartments: [
      { id: 'direct-sales', name: 'Direct Sales' },
      { id: 'social-media', name: 'Social Media' },
      { id: 'retention-team', name: 'Retention Team' },
      { id: 'courier-team', name: 'Courier Team' },
    ],
  },
  { id: 'hr', name: 'HR', type: 'protected' },
  { id: 'ceo', name: 'CEO', type: 'protected' },
]
