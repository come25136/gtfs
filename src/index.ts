import * as admZip from 'adm-zip'
import * as createHttpError from 'http-errors'
import * as _ from 'lodash'
import * as moment from 'moment'
import * as neatCsv from 'neat-csv'
import bomZettaikorosuMan = require('strip-bom-buf')

import { convertStringFullWidthToHalfWidth, h24ToLessH24 } from './util'

const requiredFiles: string[] = [
  'agency.txt',
  'stops.txt',
  'routes.txt',
  'trips.txt',
  'stop_times.txt'
]

const conditionallyRequiredFiles: ((fileNames: string[]) => boolean)[] = [
  (fileNames: string[]) =>
    _.difference(['calendar.txt', 'calendar_dates.txt'], fileNames).length !== 0
]

export interface Location {
  lat: number
  lon: number
}

// https://developers.google.com/transit/gtfs/reference

export interface RawAgency {
  agency_id?: string
  agency_name: string
  agency_url: string // https://example.com
  agency_timezone: string // Asia/Tokyo
  agency_lang?: string // ja とか ja-jp とかそういうやつ
  agency_phone?: string // 03-0000-0000
  agency_fare_url?: string // https://example.com/ticket
  agency_email?: string // support@example.com
}

export interface RawMultiAgency extends RawAgency {
  agency_id: string
}

export type RawAgencies = [RawAgency] | RawMultiAgency[]

export interface RawStop {
  stop_id: string
  stop_code?: string
  stop_name: string
  stop_desc?: string
  stop_lat: string
  stop_lon: string
  zone_id?: string
  stop_url?: string
  location_type?: string
  parent_station?: string
  stop_timezone?: string // Asia/Tokyo
  wheelchair_boarding?: string
  level_id?: string
  platform_code?: string
}

export type RawRoute = {
  route_id: string
  agency_id?: string
  route_desc?: string
  route_type: string
  route_url?: string
  route_color: string // FFFFFF
  route_text_color?: string // 000000
  route_sort_order?: string
} & (
    | { route_short_name: string }
    | { route_long_name: string }
    | {
      route_short_name: string
      route_long_name: string
    })

export interface RawTrip {
  route_id: string
  service_id: string
  trip_id: string
  trip_headsign?: string
  trip_short_name?: string
  direction_id?: string
  block_id?: string
  shape_id?: string
  wheelchair_accessible?: string
  bikes_allowed: string
}

export interface RawStopTime {
  trip_id: string
  arrival_time: string
  departure_time: string
  stop_id: string
  stop_sequence: string
  stop_headsign?: string
  pickup_type?: string
  drop_off_type?: string
  shape_dist_traveled?: string
  timepoint?: string
}

export interface RawCalendar {
  service_id: string
  monday: string
  tuesday: string
  wednesday: string
  thursday: string
  friday: string
  saturday: string
  sunday: string
  start_date: string
  end_date: string
}

export interface RawCalendarDate {
  service_id: string
  date: string
  exception_type: string
}

export interface RawFareAttribute {
  fare_id: string
  price: string
  currency_type: string
  payment_method: string
  transfers: string
  agency_id?: string
  transfer_duration?: string
}

export interface RawFareRule {
  fare_id: string
  route_id?: string
  origin_id?: string
  destination_id: string
  contains_id?: string
}

export interface RawShape {
  shape_id: string
  shape_pt_lat: string
  shape_pt_lon: string
  shape_pt_sequence: string
  shape_dist_traveled?: string
}
export interface RawFrequency {
  trip_id: string
  start_time: string
  end_time: string
  headway_secs: string
  exact_times?: string
}

export interface RawTransfer {
  from_stop_id: string
  to_stop_id: string
  transfer_type: string
  min_transfer_time?: string
}

export interface RawPathway {
  pathway_id: string
  from_stop_id: RawStop['stop_id']
  to_stop_id: RawStop['stop_id']
  pathway_mode: string
  is_bidirectional: string
  length?: string
  traversal_time?: string
  stair_count?: string
  max_slope?: string
  min_width?: string
  signposted_as?: string
  reversed_signposted_as?: string
}

export interface RawLevel {
  level_id: string
  level_index: string
  level_name?: string
}

export interface RawFeedInfo {
  feed_publisher_name: string
  feed_publisher_url: string
  feed_lang: string
  feed_start_date?: string
  feed_end_date?: string
  feed_version?: string
  feed_contact_email?: string
  feed_contact_url?: string
}

export interface RawTranslation {
  trans_id: string
  lang: string
  translation: string
}

export interface Agency {
  id: null | string
  name: string
  url: string
  timezone: string
  lang: null | string
  phone: null | string
  fareUrl: null | string
  email: null | string
}

export interface MultiAgency extends Agency {
  id: string
}

export type Agencies = [Agency] | MultiAgency[]

export interface Stop {
  id: string
  code: null | string
  name: string
  description: null | string
  location: { type: 0 | 1 | 2 } & Location
  zone: {
    id: null | string
  }
  url: null | string
  parentStation: null | 0 | 1
  timezone: null | string
  wheelchairBoarding: 0 | 1 | 2
  level: {
    id: null | Level['id']
  }
  platformCode: null | string
}

export interface Route {
  id: string
  agencyId: Agency['id']
  name:
  | {
    short: string
    long: null | string
  }
  | {
    short: null | string
    long: string
  }
  description: null | string
  type: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  url: null | string
  color: string
  textColor: string
  sortOrder: number
}

export interface Trip {
  routeId: Route['id']
  serviceId: string
  id: string
  headsign: null | string
  shortName: null | string
  directionId: null | 0 | 1
  blockId: null | string
  shapeId: null | Shape['id']
  wheelchairSccessible: 0 | 1 | 2
  bikesSllowed: 0 | 1 | 2
}

export interface StopTime {
  tripId: Trip['id']
  time: {
    arrival: moment.Moment
    departure: moment.Moment
  }

  stopId: Stop['id']
  sequence: number
  headsign: null | string
  pickupType: 0 | 1 | 2 | 3
  dropOffType: 0 | 1 | 2 | 3
  shapeDistTraveled: null | number
  timepoint: 0 | 1
}

export interface RouteStop<Realtime extends boolean = false> extends Stop {
  sequence: StopTime['sequence']
  date: {
    arrival: {
      schedule: moment.Moment
    }
    departure: {
      schedule: moment.Moment
    }
  } & (Realtime extends true
    ?
    | {
      arrival: {
        decision: moment.Moment
      }
    }
    | {
      departure: {
        decision: moment.Moment
      }
    }
    | {
      arrival: {
        decision: moment.Moment
      }
      departure: {
        decision: moment.Moment
      }
    }
    : {})
  headsign: StopTime['headsign']
}

export interface Calendar {
  serviceId: Trip['serviceId']
  days: {
    mon: boolean
    tues: boolean
    wednes: boolean
    thurs: boolean
    fri: boolean
    satur: boolean
    sun: boolean
  }
  date: {
    start: moment.Moment
    end: moment.Moment
  }
}

export interface CalendarDate {
  serviceId: Trip['serviceId']
  date: moment.Moment
  exceptionType: 1 | 2
}

const ISO4217: string[] = [
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CUC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GGP',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HRK',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRO',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLL',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VEF',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XAG',
  'XAU',
  'XCD',
  'XDR',
  'XOF',
  'XPD',
  'XPF',
  'XPT',
  'XTS',
  'XXX',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL'
]

export interface FareAttribute {
  fareId: string
  price: number
  currencyType:
  | 'AED'
  | 'AFN'
  | 'ALL'
  | 'AMD'
  | 'ANG'
  | 'AOA'
  | 'ARS'
  | 'AUD'
  | 'AWG'
  | 'AZN'
  | 'BAM'
  | 'BBD'
  | 'BDT'
  | 'BGN'
  | 'BHD'
  | 'BIF'
  | 'BMD'
  | 'BND'
  | 'BOB'
  | 'BRL'
  | 'BSD'
  | 'BTN'
  | 'BWP'
  | 'BYN'
  | 'BZD'
  | 'CAD'
  | 'CDF'
  | 'CHF'
  | 'CLP'
  | 'CNY'
  | 'COP'
  | 'CRC'
  | 'CUC'
  | 'CUP'
  | 'CVE'
  | 'CZK'
  | 'DJF'
  | 'DKK'
  | 'DOP'
  | 'DZD'
  | 'EGP'
  | 'ERN'
  | 'ETB'
  | 'EUR'
  | 'FJD'
  | 'FKP'
  | 'GBP'
  | 'GEL'
  | 'GGP'
  | 'GHS'
  | 'GIP'
  | 'GMD'
  | 'GNF'
  | 'GTQ'
  | 'GYD'
  | 'HKD'
  | 'HNL'
  | 'HRK'
  | 'HTG'
  | 'HUF'
  | 'IDR'
  | 'ILS'
  | 'INR'
  | 'IQD'
  | 'IRR'
  | 'ISK'
  | 'JMD'
  | 'JOD'
  | 'JPY'
  | 'KES'
  | 'KGS'
  | 'KHR'
  | 'KMF'
  | 'KPW'
  | 'KRW'
  | 'KWD'
  | 'KYD'
  | 'KZT'
  | 'LAK'
  | 'LBP'
  | 'LKR'
  | 'LRD'
  | 'LSL'
  | 'LYD'
  | 'MAD'
  | 'MDL'
  | 'MGA'
  | 'MKD'
  | 'MMK'
  | 'MNT'
  | 'MOP'
  | 'MRO'
  | 'MUR'
  | 'MVR'
  | 'MWK'
  | 'MXN'
  | 'MYR'
  | 'MZN'
  | 'NAD'
  | 'NGN'
  | 'NIO'
  | 'NOK'
  | 'NPR'
  | 'NZD'
  | 'OMR'
  | 'PAB'
  | 'PEN'
  | 'PGK'
  | 'PHP'
  | 'PKR'
  | 'PLN'
  | 'PYG'
  | 'QAR'
  | 'RON'
  | 'RSD'
  | 'RUB'
  | 'RWF'
  | 'SAR'
  | 'SBD'
  | 'SCR'
  | 'SDG'
  | 'SEK'
  | 'SGD'
  | 'SHP'
  | 'SLL'
  | 'SOS'
  | 'SRD'
  | 'SSP'
  | 'STN'
  | 'SVC'
  | 'SYP'
  | 'SZL'
  | 'THB'
  | 'TJS'
  | 'TMT'
  | 'TND'
  | 'TOP'
  | 'TRY'
  | 'TTD'
  | 'TWD'
  | 'TZS'
  | 'UAH'
  | 'UGX'
  | 'USD'
  | 'UYU'
  | 'UZS'
  | 'VEF'
  | 'VND'
  | 'VUV'
  | 'WST'
  | 'XAF'
  | 'XAG'
  | 'XAU'
  | 'XCD'
  | 'XDR'
  | 'XOF'
  | 'XPD'
  | 'XPF'
  | 'XPT'
  | 'XTS'
  | 'XXX'
  | 'YER'
  | 'ZAR'
  | 'ZMW'
  | 'ZWL'
  paymentMethod: 0 | 1
  transfers: null | 0 | 1 | 2
  agencyId: null | string
  transferDuration: null | number
}

export interface FareRule {
  fareId: string
  routeId: null | string
  originId: null | string
  destinationId: null | string
  containsId: null | string
}

export interface Shape {
  id: string
  location: Location
  sequence: number

  distTraveled: null | number
}

export interface Frequency {
  tripId: Trip['id']
  time: {
    start: moment.Moment
    end: moment.Moment
  }
  headwaySecs: number
  exactTimes: 0 | 1
}

export type Transfer = {
  stop: {
    from: {
      id: string
    }
    to: {
      id: string
    }
  }
} & ({
  type: 0 | 1 | 3
} | {
  type: 2
  time: {
    min: number
  }
})

export interface Pathway {
  id: string
  from: {
    stop: {
      id: Stop['id']
    }
  }
  to: {
    stop: {
      id: Stop['id']
    }
  }
  pathwayMode: 1 | 2 | 3 | 4 | 5 | 6 | 7
  isBidirectional: 0 | 1
  length: null | number // meters!! yay!!!
  traversalTime: null | number
  stair: {
    count: null | number
  }
  slope: {
    max: null | number
  }
  width: {
    min: null | number
  }
  signpostedAs: null | string
  reversedSignpostedAs: null | string
}

export interface Level {
  id: string
  index: number
  name: null | string
}

export interface FeedInfo {
  publisher: {
    name: string
    url: string
  }
  lang: string
  date: {
    start: null | moment.Moment
    end: null | moment.Moment
  }
  version: null | string
  contact: {
    email: null | string
    url: null | string
  }
}

export interface Translation {
  [id: string]: {
    [lang: string]: string
  }
}

const dayNames = ['sun', 'mon', 'tues', 'wednes', 'thurs', 'fri', 'satur']

export type gtfs = {
  agency: Agencies
  stops: Stop[]
  routes: Route[]
  trips: Trip[]
  stopTimes: StopTime[]
  fareAttributes?: FareAttribute[]
  fareRules?: FareRule[]
  shapes?: Shape[]
  frequencies?: Frequency[]
  transfers?: Transfer[]
  pathways?: Pathway[]
  levels?: Level[]
  feedInfo?: FeedInfo[]
  translations?: Translation
} & (
    | { calendar: Calendar[] }
    | {
      calendarDates: CalendarDate[]
    }
    | {
      calendar: Calendar[]
      calendarDates: CalendarDate[]
    })

export class GTFS {
  static async importZipBuffer(zipBuffer: Buffer): Promise<GTFS> {
    const zipEntries: admZip.IZipEntry[] = new admZip(zipBuffer).getEntries()
    const zipEntryNames: string[] = zipEntries.map(
      ({ entryName }) => entryName
    )

    if (
      _.difference(requiredFiles, zipEntryNames).length !== 0 ||
      conditionallyRequiredFiles.some(f => f(zipEntryNames))
    )
      throw new Error('It is not normal GTSF.')

    const entries = await Promise.all(
      zipEntries.map(async entity => {
        switch (entity.entryName) {
          default:
            return

          case 'agency.txt':
            const rawAgencies = await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )

            if (rawAgencies.length === 0)
              throw new Error(
                'Please include one or more company information in agency.txt.'
              )

            const agencies = rawAgencies.map(row => ({
              id: row.agency_id || null,
              name: row.agency_name,
              url: row.agency_url,
              timezone: row.agency_timezone,
              lang: row.agency_lang || null,
              phone: row.agency_phone || null,
              fareUrl: row.agency_fare_url || null,
              email: row.agency_email || null
            }))

            return {
              key: 'agency',
              rows:
                agencies.length === 1
                  ? (agencies as [Agency])
                  : (agencies as MultiAgency[])
            }

          case 'stops.txt':
            const rawStops = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawStop[]

            return {
              key: 'stops',
              rows: rawStops.map<Stop>(row => {
                const locationType = Number(row.location_type) || 0
                const parentStation = Number(row.parent_station) || 0
                const wheelchairBoarding = Number(row.wheelchair_boarding) || 0

                if ([0, 1, 2].includes(locationType) === false)
                  throw new Error(
                    `Can not use '${locationType}' for location_type.`
                  )
                if ([0, 1].includes(parentStation) === false)
                  throw new Error(
                    `Can not use '${parentStation}' for parent_station.`
                  )
                if ([0, 1, 2].includes(wheelchairBoarding) === false)
                  throw new Error(
                    `Can not use '${wheelchairBoarding}' for wheelchair_boarding.`
                  )

                return {
                  id: row.stop_id,
                  code: row.stop_code || null,
                  name: row.stop_name,
                  description: row.stop_desc || null,
                  location: {
                    type: locationType as Stop['location']['type'],
                    lat: Number(row.stop_lat),
                    lon: Number(row.stop_lon)
                  },
                  zone: { id: row.zone_id || null },
                  url: row.stop_url || null,
                  parentStation: parentStation as Stop['parentStation'],
                  timezone: row.stop_timezone || null,
                  wheelchairBoarding: wheelchairBoarding as Stop['wheelchairBoarding'],
                  level: {
                    id: row.level_id === undefined ? null : row.level_id
                  },
                  platformCode: row.parent_station || null
                }
              })
            }

          case 'routes.txt':
            const rawRoutes = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawRoute[]

            return {
              key: 'routes',
              rows: rawRoutes.map<Route>(row => {
                const shortName =
                  'route_short_name' in row ? row.route_short_name : null
                const longName =
                  'route_long_name' in row ? row.route_long_name : null
                const type = Number(row.route_type)

                if (shortName === null && longName === null)
                  throw new Error(
                    `route_short_name and route_long_name can not be empty.`
                  )
                if ([0, 1, 2, 3, 4, 5, 6, 7].includes(type) === false)
                  throw new Error(`Can not use '${type}' for route_type.`)

                return {
                  id: row.route_id,
                  agencyId: row.agency_id || null,
                  name: {
                    short: convertStringFullWidthToHalfWidth(shortName),
                    long: convertStringFullWidthToHalfWidth(longName)
                  } as Route['name'],
                  description: convertStringFullWidthToHalfWidth(
                    row.route_desc || null
                  ),
                  type: type as Route['type'],
                  url: row.route_url || null,
                  color: row.route_color || '',
                  textColor: row.route_text_color || '',
                  sortOrder: Number(row.route_sort_order) || 0
                }
              })
            }

          case 'trips.txt':
            const rawTrips = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawTrip[]

            return {
              key: 'trips',
              rows: rawTrips.map<Trip>(row => {
                const directionId = Number(row.direction_id)
                const wheelchairSccessible = Number(row.wheelchair_accessible)
                const bikesSllowed = Number(row.bikes_allowed)

                if (
                  Number.isNaN(directionId) === false &&
                  [0, 1].includes(directionId) === false
                )
                  throw new Error(
                    `Can not use '${directionId}' for direction_id.`
                  )
                if (
                  Number.isNaN(wheelchairSccessible) === false &&
                  [0, 1, 2].includes(wheelchairSccessible) === false
                )
                  throw new Error(
                    `Can not use '${wheelchairSccessible}' for wheelchair_accessible.`
                  )
                if (
                  Number.isNaN(bikesSllowed) === false &&
                  [0, 1, 2].includes(bikesSllowed) === false
                )
                  throw new Error(
                    `Can not use '${bikesSllowed}' for bikes_allowed.`
                  )

                return {
                  routeId: row.route_id,
                  serviceId: row.service_id,
                  id: row.trip_id,
                  headsign: convertStringFullWidthToHalfWidth(
                    row.trip_headsign || null
                  ),
                  shortName: convertStringFullWidthToHalfWidth(
                    row.trip_short_name || null
                  ),
                  directionId: Number.isNaN(directionId)
                    ? null
                    : (directionId as Trip['directionId']),
                  blockId: row.block_id || null,
                  shapeId: row.shape_id || null,
                  wheelchairSccessible: Number.isNaN(wheelchairSccessible)
                    ? 0
                    : (wheelchairSccessible as Trip['wheelchairSccessible']),
                  bikesSllowed: Number.isNaN(bikesSllowed)
                    ? 0
                    : (bikesSllowed as Trip['bikesSllowed'])
                }
              })
            }

          case 'stop_times.txt':
            const rawStopTimes = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawStopTime[]

            return {
              key: 'stopTimes',
              rows: rawStopTimes.map<StopTime>(row => {
                const pickupType = Number(row.pickup_type || 0)
                const dropOffType = Number(row.drop_off_type || 0)
                const timepoint = Number(row.timepoint || 1)

                if ([0, 1, 2, 3].includes(pickupType) === false)
                  throw new Error(
                    `Can not use '${pickupType}' for pickup_type.`
                  )
                if ([0, 1, 2, 3].includes(dropOffType) === false)
                  throw new Error(
                    `Can not use '${dropOffType}' for drop_off_type.`
                  )
                if ([0, 1].includes(timepoint) === false)
                  throw new Error(`Can not use '${timepoint}' for timepoint.`)

                return {
                  tripId: row.trip_id,
                  time: {
                    arrival: h24ToLessH24(row.arrival_time),
                    departure: h24ToLessH24(row.departure_time)
                  },
                  stopId: row.stop_id,
                  sequence: Number(row.stop_sequence),
                  headsign: row.stop_headsign || null,
                  pickupType: pickupType as StopTime['pickupType'],
                  dropOffType: dropOffType as StopTime['dropOffType'],
                  shapeDistTraveled: Number(row.shape_dist_traveled) || null,
                  timepoint: timepoint as StopTime['timepoint']
                }
              })
            }

          case 'calendar.txt':
            const rawCalendar = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawCalendar[]

            return {
              key: 'calendar',
              rows: rawCalendar.map<Calendar>(row => {
                const monday = Number(row.monday)
                const tuesday = Number(row.tuesday)
                const wednesday = Number(row.wednesday)
                const thursday = Number(row.thursday)
                const friday = Number(row.friday)
                const saturday = Number(row.saturday)
                const sunday = Number(row.sunday)

                if ([0, 1].includes(monday) === false)
                  throw new Error(`Can not use '${monday}' for monday.`)
                if ([0, 1].includes(tuesday) === false)
                  throw new Error(`Can not use '${tuesday}' for tuesday.`)
                if ([0, 1].includes(wednesday) === false)
                  throw new Error(`Can not use '${wednesday}' for wednesday.`)
                if ([0, 1].includes(thursday) === false)
                  throw new Error(`Can not use '${thursday}' for thursday.`)
                if ([0, 1].includes(friday) === false)
                  throw new Error(`Can not use '${friday}' for friday.`)
                if ([0, 1].includes(saturday) === false)
                  throw new Error(`Can not use '${saturday}' for saturday.`)
                if ([0, 1].includes(sunday) === false)
                  throw new Error(`Can not use '${sunday}' for sunday.`)

                return {
                  serviceId: row.service_id,
                  days: {
                    mon: Boolean(monday),
                    tues: Boolean(tuesday),
                    wednes: Boolean(wednesday),
                    thurs: Boolean(thursday),
                    fri: Boolean(friday),
                    satur: Boolean(saturday),
                    sun: Boolean(sunday)
                  },
                  date: {
                    start: moment(row.start_date, 'YYYYMMDD'),
                    end: moment(row.end_date, 'YYYYMMDD')
                  }
                }
              })
            }

          case 'calendar_dates.txt':
            const rawCalendarDate = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawCalendarDate[]

            return {
              key: 'calendarDates',
              rows: rawCalendarDate.map<CalendarDate>(row => {
                const exceptionType = Number(row.exception_type)

                if ([1, 2].includes(exceptionType) === false)
                  throw new Error(
                    `Can not use ${exceptionType} for exception_type.`
                  )

                return {
                  serviceId: row.service_id,
                  date: moment(row.date, 'YYYYMMDD'),
                  exceptionType: exceptionType as CalendarDate['exceptionType']
                }
              })
            }

          case 'fare_attributes.txt':
            const rawFareAttributes = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawFareAttribute[]

            return {
              key: 'fareAttributes',
              rows: rawFareAttributes.map<FareAttribute>(row => {
                const currencyType = row.currency_type
                const paymentMethod = Number(row.payment_method)
                const transfers = Number(row.transfers) || null
                const transferDuration = Number(row.transfer_duration)

                if (ISO4217.includes(currencyType) === false)
                  throw new Error(
                    `Can not use '${currencyType}' for currency_type.`
                  )
                if ([0, 1].includes(paymentMethod) === false)
                  throw new Error(
                    `Can not use '${paymentMethod}' for payment_method.`
                  )
                if (
                  transfers !== null &&
                  [0, 1, 2].includes(transfers) === false
                )
                  throw new Error(`Can not use '${transfers}' for transfers.`)
                if (
                  row.transfer_duration !== undefined &&
                  Number.isNaN(transferDuration)
                )
                  throw new Error(
                    'Only numbers can be used for transfer_duration.'
                  )

                return {
                  fareId: row.fare_id,
                  price: Number(row.price),
                  currencyType: currencyType as FareAttribute['currencyType'],
                  paymentMethod: paymentMethod as FareAttribute['paymentMethod'],
                  transfers: transfers as FareAttribute['transfers'],
                  agencyId: row.agency_id || null,
                  transferDuration: transferDuration || null
                }
              })
            }

          case 'fare_rules.txt':
            const rawFareRules = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawFareRule[]

            return {
              key: 'fareRules',
              rows: rawFareRules.map<FareRule>(row => ({
                fareId: row.fare_id,
                routeId: row.route_id || null,
                originId: row.origin_id || null,
                destinationId: row.destination_id || null,
                containsId: row.contains_id || null
              }))
            }

          case 'shapes.txt':
            const rawShapes = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawShape[]

            return {
              key: 'shapes',
              rows: rawShapes.map<Shape>(row => {
                const lat = Number(row.shape_pt_lat)
                const lon = Number(row.shape_pt_lon)
                const sequence = Number(row.shape_pt_sequence)
                const distTraveled = Number(row.shape_pt_sequence)

                if (Number.isNaN(lat))
                  throw new Error('Only numbers can be used for shape_pt_lat.')
                if (Number.isNaN(lon))
                  throw new Error('Only numbers can be used for shape_pt_lon.')
                if (Number.isNaN(sequence))
                  throw new Error(
                    'Only numbers can be used for shape_pt_sequence.'
                  )
                if (Number.isNaN(distTraveled))
                  throw new Error(
                    'Only numbers can be used for shape_pt_sequence.'
                  )

                return {
                  id: row.shape_id,
                  location: {
                    lat,
                    lon
                  },
                  sequence,
                  distTraveled
                }
              })
            }

          case 'frequencies.txt':
            const rawFrequencies = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawFrequency[]

            return {
              key: 'frequencies',
              rows: rawFrequencies.map<Frequency>(row => {
                const headwaySecs = Number(row.headway_secs)
                const exactTimes = Number(row.exact_times) || 0

                if (Number.isNaN(headwaySecs))
                  throw new Error('Only numbers can be used for headway_secs.')
                if ([0, 1].includes(exactTimes) === false)
                  throw new Error(
                    `Can not use '${exactTimes}' for exact_times.`
                  )

                return {
                  tripId: row.trip_id,
                  time: {
                    start: moment(row.start_time, 'HH:mm:ss'),
                    end: moment(row.end_time, 'HH:mm:ss')
                  },
                  headwaySecs,
                  exactTimes: exactTimes as Frequency['exactTimes']
                }
              })
            }

          case 'transfers.txt':
            const rawTransfers = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawTransfer[]

            return {
              key: 'transfers',
              rows: rawTransfers.map<Transfer>(row => {
                const transferType = Number(row.transfer_type)
                const minTransferTime = Number(row.min_transfer_time)

                if ([0, 1, 2, 3].includes(transferType) === false)
                  throw new Error(
                    `Can not use '${transferType}' for transfer_type.`
                  )
                if (transferType === 2) {
                  if (row.min_transfer_time === undefined)
                    throw new Error(
                      'When transfer_type is 2, specify an integer of 0 or more for min_transfer_time.'
                    )
                  if (Number.isNaN(minTransferTime))
                    throw new Error(
                      'Only numbers can be used for min_transfer_time.'
                    )
                }

                if (transferType === 2) return {
                  stop: {
                    from: {
                      id: row.from_stop_id
                    },
                    to: {
                      id: row.to_stop_id
                    }
                  },
                  type: transferType,
                  time: {
                    min: minTransferTime
                  }
                }

                return {
                  stop: {
                    from: {
                      id: row.from_stop_id
                    },
                    to: {
                      id: row.to_stop_id
                    }
                  },
                  type: transferType as 0 | 1 | 3
                }
              })
            }

          case 'pathways.txt':
            const pathways = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawPathway[]

            return {
              key: 'pathways',
              rows: pathways.map<Pathway>(row => {
                const pathwayMode = Number(row.pathway_mode)
                const isBidirectional = Number(row.is_bidirectional)

                if ([0, 1, 2, 3, 4, 5, 6, 7].includes(pathwayMode) === false)
                  throw new Error(
                    `Can not use '${pathwayMode}' for pathway_mode.`
                  )

                if ([0, 1].includes(isBidirectional) === false) throw new Error(
                  `Can not use '${isBidirectional}' for is_bidirectional.`
                )

                return {
                  id: row.pathway_id,
                  from: {
                    stop: {
                      id: row.from_stop_id
                    }
                  },
                  to: {
                    stop: {
                      id: row.to_stop_id
                    }
                  },
                  pathwayMode: pathwayMode as Pathway['pathwayMode'],
                  isBidirectional: isBidirectional as Pathway['isBidirectional'],
                  length: row.length === undefined ? null : Number(row.length),
                  traversalTime: row.traversal_time === undefined ? null : Number(row.traversal_time),
                  stair: {
                    count: row.stair_count === undefined ? null : Number(row.stair_count)
                  },
                  slope: {
                    max: row.max_slope === undefined ? null : Number(row.max_slope)
                  },
                  width: {
                    min: row.min_width === undefined ? null : Number(row.min_width)
                  },
                  signpostedAs: row.signposted_as || null,
                  reversedSignpostedAs: row.reversed_signposted_as || null
                }
              })
            }

          case 'levels.txt':
            const levels = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawLevel[]

            return {
              key: 'pathways',
              rows: levels.map<Level>(row => {
                return {
                  id: row.level_id,
                  index: Number(row.level_index),
                  name: row.level_name || null
                }
              })
            }

          case 'feed_info.txt':
            const rawFeedInfo = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawFeedInfo[]

            return {
              key: 'feedInfo',
              rows: rawFeedInfo.map<FeedInfo>(row => {
                const startDate = moment(row.feed_start_date, 'YYYYMMDD')
                const endDate = moment(row.feed_end_date, 'YYYYMMDD')

                if (startDate.isValid() === false)
                  throw createHttpError(
                    400,
                    'The format of feed_start_date is incorrect.'
                  )
                if (endDate.isValid() === false)
                  throw createHttpError(
                    400,
                    'The format of feed_end_date is incorrect.'
                  )
                if (endDate.isBefore(startDate))
                  throw createHttpError(
                    400,
                    'feed_end_date must specify a date after feed_start_date.'
                  )

                return {
                  publisher: {
                    name: row.feed_publisher_name,
                    url: row.feed_publisher_url
                  },
                  lang: row.feed_lang,
                  date: {
                    start: startDate,
                    end: endDate
                  },
                  version: row.feed_version || null,
                  contact: {
                    email: row.feed_contact_email || null,
                    url: row.feed_contact_url || null
                  }
                }
              })
            }

          case 'translations.txt':
            const rawTranslations = ((await neatCsv(
              bomZettaikorosuMan(entity.getData())
            )) as unknown) as RawTranslation[]

            const translation: Translation = {}

            rawTranslations.forEach(row => {
              translation[row.trans_id] = {
                ...translation[row.trans_id],
                [row.lang]: row.translation
              }
            })

            return {
              key: 'translations',
              rows: translation
            }
        }
      })
    )

    return new GTFS(
      entries.reduce<gtfs>(
        (p, c) => (c === undefined ? p : { ...p, [c.key]: c.rows }),
        {
          agency: ([] as unknown) as Agencies,
          stops: [],
          routes: [],
          trips: [],
          stopTimes: [],
          calendar: []
        }
      )
    )
  }

  readonly agencies: Agencies
  readonly stops: Stop[] = []
  readonly routes: Route[] = []
  readonly trips: Trip[] = []
  readonly stopTimes: StopTime[] = []
  readonly calendar: Calendar[] = []
  readonly calendarDates: CalendarDate[] = []
  readonly fareAttributes: FareAttribute[] = []
  readonly fareRules: FareRule[] = []
  readonly shapes: Shape[] = []
  readonly frequencies: Frequency[] = []
  readonly transfers: Transfer[] = []
  readonly pathways: Pathway[] = []
  readonly levels: Level[] = []
  readonly feedInfo: FeedInfo[] = []
  readonly translations: Translation = {}

  constructor(gtfs: gtfs) {
    this.agencies = gtfs.agency
    this.stops = gtfs.stops
    this.routes = gtfs.routes
    this.trips = gtfs.trips
    this.stopTimes = gtfs.stopTimes
    if ('calendar' in gtfs) this.calendar = gtfs.calendar
    if ('calendarDates' in gtfs) this.calendarDates = gtfs.calendarDates
    if (gtfs.fareAttributes !== undefined)
      this.fareAttributes = gtfs.fareAttributes
    if (gtfs.fareRules !== undefined) this.fareRules = gtfs.fareRules
    if (gtfs.shapes !== undefined) this.shapes = gtfs.shapes
    if (gtfs.frequencies !== undefined) this.frequencies = gtfs.frequencies
    if (gtfs.transfers !== undefined) this.transfers = gtfs.transfers
    if (gtfs.pathways !== undefined) this.pathways = gtfs.pathways
    if (gtfs.levels !== undefined) this.levels = gtfs.levels
    if (gtfs.feedInfo !== undefined) this.feedInfo = gtfs.feedInfo
    if (gtfs.translations !== undefined) this.translations = gtfs.translations
  }

  findServiceIds(date: moment.Moment): string[] {
    const calendarDates = this.calendarDates.filter(calendarDate =>
      calendarDate.date.isSame(date, 'day')
    )

    return _.concat<{ serviceId: string }>(
      this.calendar.filter(calendar => {
        if (
          date.isBetween(
            calendar.date.start,
            calendar.date.end,
            'day',
            '[]'
          ) === false
        )
          return false

        const base: boolean =
          calendar.days[
          dayNames[date.day()] as
          | 'sun'
          | 'mon'
          | 'tues'
          | 'wednes'
          | 'thurs'
          | 'fri'
          | 'satur'
          ]

        const serviceIdMatchCalendarDates = calendarDates.filter(
          calendarDate => calendarDate.serviceId === calendar.serviceId
        )

        if (serviceIdMatchCalendarDates.length) {
          const add = serviceIdMatchCalendarDates.some(
            service => service.exceptionType === 1
          )

          const remove = serviceIdMatchCalendarDates.some(
            service => service.exceptionType === 2
          )

          if (remove) return false
          if (add) return true
        }

        return base
      }),
      _.filter(calendarDates, {
        exceptionType: 1
      })
    ).map(({ serviceId }) => serviceId)
  }

  get stopIds(): string[] {
    return this.stops.map(stop => stop.id)
  }

  findStop(stopId: string): Stop {
    const stop = _.find(this.stops, { id: stopId })

    if (stop === undefined)
      throw createHttpError(404, 'There is no such stop.')

    return stop
  }

  findRoute(routeId: string): Route {
    const route = _.find(this.routes, {
      id: routeId
    })

    if (route === undefined)
      throw createHttpError(404, 'There is no such route.')

    return route
  }

  findRoutes(
    args:
      | {
        tripId: string
        standardDate?: moment.Moment
      }
      | {
        routeId: string
        firstStopDate?: moment.Moment
        dayOnly?: boolean
      }
  ): (Trip & {
    stops: RouteStop[]
  })[] {
    const trips = this.findTrips(args)

    if ('tripId' in args) {
      const stopTimes = _.filter(this.stopTimes, { tripId: trips[0].id })

      if (stopTimes.length === 0)
        throw createHttpError(404, 'There is no such stopTime.')

      const routeStops: RouteStop[] = stopTimes.map(stopTime => {
        const stop = _.find(this.stops, {
          id: stopTime.stopId
        })

        if (stop === undefined)
          throw createHttpError(404, 'There is no such stop.')

        return {
          ...stop,
          sequence: stopTime.sequence,
          date: {
            arrival: {
              schedule: h24ToLessH24(
                stopTime.time.arrival,
                args.standardDate || stopTimes[0].time.arrival
              )
            },
            departure: {
              schedule: h24ToLessH24(
                stopTime.time.departure,
                args.standardDate || stopTimes[0].time.arrival
              )
            }
          },
          location: stop.location,
          headsign: convertStringFullWidthToHalfWidth(
            stopTime.headsign || trips[0].headsign
          )
        }
      })

      return [{ ...trips[0], stops: routeStops }]
    } else {
      const firstStopDate = args.firstStopDate || moment()
      const dayOnly = args.dayOnly || false

      const routesStops = _.compact(
        trips.map(trip => {
          const stopTimes = _.filter(this.stopTimes, { tripId: trip.id })

          if (stopTimes.length === 0)
            throw createHttpError(404, 'There is no such stopTime.')

          if (
            ((this.findServiceIds(firstStopDate).includes(trip.serviceId) &&
              dayOnly) ||
              stopTimes[0].time.arrival.isSame(firstStopDate, 'day')) === false
          )
            return

          const routeStops: RouteStop[] = stopTimes.map<RouteStop>(stopTime => {
            const stop = _.find(this.stops, {
              id: stopTime.stopId
            })

            if (stop === undefined)
              throw createHttpError(404, 'There is no such stop.')

            return {
              ...stop,
              sequence: stopTime.sequence,
              date: {
                arrival: {
                  schedule: h24ToLessH24(stopTime.time.arrival, firstStopDate)
                },
                departure: {
                  schedule: h24ToLessH24(stopTime.time.departure, firstStopDate)
                }
              },
              location: stop.location,
              headsign: stopTime.headsign || trip.headsign,
              direction: trip.directionId
            }
          })

          return { ...trip, stops: routeStops }
        })
      )

      if (routesStops.length === 0)
        throw createHttpError(404, 'There is no such route.')

      return routesStops
    }
  }

  findTrips(
    args:
      | {
        tripId: string
      }
      | {
        routeId: string
      }
  ): Trip[] {
    if ('tripId' in args) {
      const trip = _.find(this.trips, { id: args.tripId })

      if (trip === undefined)
        throw createHttpError(404, 'There is no such trip.')

      return [trip]
    } else {
      const trips: Trip[] = _.filter(this.trips, { routeId: args.routeId })

      if (trips.length === 0)
        throw createHttpError(404, 'There is no such trip.')

      return trips
    }
  }

  getShape(
    routeId: string
  ): {
    id: string
    points: {
      location: Location
      distTraveled: null | number
    }[]
  } {
    const trip = _.find(this.trips, { routeId })
    if (trip === undefined || trip.shapeId === null)
      throw createHttpError(404, 'There is no such trip.')

    const shapes = _.filter(this.shapes, {
      id: trip.shapeId
    })
    if (shapes.length === 0)
      throw createHttpError(404, 'There is no such shape.')

    return {
      id: trip.shapeId,
      points: shapes.map(shape => ({
        location: shape.location,
        distTraveled: shape.distTraveled
      }))
    }
  }

  getGeoRoute(
    routeId: string
  ): {
    id: string
    type: 'LineString'
    coordinates: [number, number][]
  } {
    const shape = this.getShape(routeId)

    return {
      id: routeId,
      type: 'LineString',
      coordinates: shape.points.map(({ location }) => [
        location.lon,
        location.lat
      ])
    }
  }

  findTranslation(stopName: string): { [lang: string]: string } {
    if (stopName in this.translations === false)
      throw createHttpError(404, 'There is no such stop name.')

    return this.translations[stopName]
  }
}
