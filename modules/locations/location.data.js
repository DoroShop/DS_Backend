// Lightweight Philippine location data used as a cached fallback when an external provider is unavailable.
// The structure is Region -> Municipality/City -> Barangays with zip codes.
module.exports = {
  regions: [
    {
      code: 'NCR',
      name: 'National Capital Region',
      municipalities: [
        {
          code: 'MNL',
          name: 'Manila',
          zipCode: '1000',
          barangays: [
            { name: 'Barangay 1', zipCode: '1000' },
            { name: 'Barangay 2', zipCode: '1001' },
            { name: 'Barangay 3', zipCode: '1002' },
          ],
        },
        {
          code: 'QZN',
          name: 'Quezon City',
          zipCode: '1100',
          barangays: [
            { name: 'Bagong Pag-asa', zipCode: '1105' },
            { name: 'Pasong Tamo', zipCode: '1107' },
            { name: 'Commonwealth', zipCode: '1121' },
          ],
        },
      ],
    },
    {
      code: 'CAR',
      name: 'Cordillera Administrative Region',
      municipalities: [],
    },
    {
      code: 'REGION_I',
      name: 'Ilocos Region (Region I)',
      municipalities: [],
    },
    {
      code: 'REGION_II',
      name: 'Cagayan Valley (Region II)',
      municipalities: [],
    },
    {
      code: 'REGION_III',
      name: 'Central Luzon (Region III)',
      municipalities: [],
    },
    {
      code: 'REGION_IV_A',
      name: 'Calabarzon (Region IV-A)',
      municipalities: [
        {
          code: 'SNR',
          name: 'Santa Rosa',
          zipCode: '4026',
          barangays: [
            { name: 'Balibago', zipCode: '4026' },
            { name: 'Dila', zipCode: '4026' },
            { name: 'Labas', zipCode: '4026' },
          ],
        },
        {
          code: 'DAS',
          name: 'Dasmariñas',
          zipCode: '4114',
          barangays: [
            { name: 'Burol', zipCode: '4114' },
            { name: 'San Antonio', zipCode: '4114' },
            { name: 'Salitran', zipCode: '4114' },
          ],
        },
      ],
    },
    {
      code: 'REGION_IV_B',
      name: 'Mimaropa (Region IV-B)',
      provinces: [
        {
          code: '1705200000',
          name: 'Oriental Mindoro',
          cities: [
            {
              code: '1705205000',
              name: 'City of Calapan',
              zipCode: '5200',
              barangays: [
                { name: 'Barangay 1', zipCode: '5200' },
                { name: 'Barangay 2', zipCode: '5200' },
                { name: 'Barangay 3', zipCode: '5200' },
                { name: 'Barangay 4', zipCode: '5200' },
              ],
            },
            {
              code: '1705201000',
              name: 'Baco',
              zipCode: '5100',
              barangays: [
                { name: 'Baco Iloco', zipCode: '5100' },
                { name: 'Caingaan', zipCode: '5100' },
                { name: 'Dulangan', zipCode: '5100' },
                { name: 'Languhan', zipCode: '5100' },
              ],
            },
            {
              code: '1705202000',
              name: 'Bansud',
              zipCode: '5101',
              barangays: [
                { name: 'Bansud', zipCode: '5101' },
                { name: 'Concepcion', zipCode: '5101' },
                { name: 'Libjo', zipCode: '5101' },
              ],
            },
            {
              code: '1705206000',
              name: 'Gloria',
              zipCode: '5102',
              barangays: [
                { name: 'Gloria', zipCode: '5102' },
                { name: 'Mananas', zipCode: '5102' },
              ],
            },
            {
              code: '1705207000',
              name: 'Mansalay',
              zipCode: '5103',
              barangays: [
                { name: 'Mansalay', zipCode: '5103' },
                { name: 'Tanglaw', zipCode: '5103' },
                { name: 'Tigbao', zipCode: '5103' },
              ],
            },
            {
              code: '1705208000',
              name: 'Naujan',
              zipCode: '5104',
              barangays: [
                { name: 'Naujan', zipCode: '5104' },
                { name: 'Pansacola', zipCode: '5104' },
              ],
            },
            {
              code: '1705210000',
              name: 'Pola',
              zipCode: '5105',
              barangays: [
                { name: 'Pola', zipCode: '5105' },
                { name: 'Sal-Sal', zipCode: '5105' },
              ],
            },
            {
              code: '1705211000',
              name: 'Puerto Galera',
              zipCode: '5203',
              barangays: [
                { name: 'Aninuan', zipCode: '5203' },
                { name: 'Barrio Poblacion', zipCode: '5203' },
                { name: 'Sabang', zipCode: '5203' },
              ],
            },
            {
              code: '1705212000',
              name: 'Roxas',
              zipCode: '5106',
              barangays: [
                { name: 'Roxas', zipCode: '5106' },
                { name: 'Sablayan', zipCode: '5106' },
              ],
            },
            {
              code: '1705213000',
              name: 'San Teodoro',
              zipCode: '5107',
              barangays: [
                { name: 'San Teodoro', zipCode: '5107' },
                { name: 'Masinloc', zipCode: '5107' },
              ],
            },
            {
              code: '1705214000',
              name: 'Socorro',
              zipCode: '5108',
              barangays: [
                { name: 'Socorro', zipCode: '5108' },
                { name: 'Lumang Bayan', zipCode: '5108' },
              ],
            },
            {
              code: '1705215000',
              name: 'Victoria',
              zipCode: '5109',
              barangays: [
                { name: 'Victoria', zipCode: '5109' },
                { name: 'Dagsa', zipCode: '5109' },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'REGION_V',
      name: 'Bicol Region (Region V)',
      municipalities: [],
    },
    {
      code: 'REGION_VI',
      name: 'Western Visayas (Region VI)',
      municipalities: [],
    },
    {
      code: 'REGION_VII',
      name: 'Central Visayas (Region VII)',
      municipalities: [
        {
          code: 'CEB',
          name: 'Cebu City',
          zipCode: '6000',
          barangays: [
            { name: 'Lahug', zipCode: '6000' },
            { name: 'Mabolo', zipCode: '6000' },
            { name: 'Guadalupe', zipCode: '6000' },
          ],
        },
        {
          code: 'LAPU',
          name: 'Lapu-Lapu City',
          zipCode: '6015',
          barangays: [
            { name: 'Basak', zipCode: '6015' },
            { name: 'Gun-ob', zipCode: '6015' },
            { name: 'Pajo', zipCode: '6015' },
          ],
        },
      ],
    },
    {
      code: 'REGION_VIII',
      name: 'Eastern Visayas (Region VIII)',
      municipalities: [],
    },
    {
      code: 'REGION_IX',
      name: 'Zamboanga Peninsula (Region IX)',
      municipalities: [],
    },
    {
      code: 'REGION_X',
      name: 'Northern Mindanao (Region X)',
      municipalities: [],
    },
    {
      code: 'REGION_XI',
      name: 'Davao Region (Region XI)',
      municipalities: [],
    },
    {
      code: 'REGION_XII',
      name: 'Soccsksargen (Region XII)',
      municipalities: [],
    },
    {
      code: 'REGION_XIII',
      name: 'Caraga (Region XIII)',
      municipalities: [],
    },
    {
      code: 'BARMM',
      name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
      municipalities: [],
    },
  ],
};
