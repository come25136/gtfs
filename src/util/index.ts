import * as moment from 'moment-timezone'

/**
 * @param date 00:00:00
 * @param standard
 */
export function h24ToLessH24(
  date: string | moment.Moment,
  standard: moment.Moment = moment(),
  override: boolean = true,
  subtract: boolean = false
): moment.Moment {
  let time: {
    hour: number
    minute: number
    second: number
  }

  if (typeof date === 'string') {
    const timeSplit = date.split(':')
    time = {
      hour: Number(timeSplit[0]),
      minute: Number(timeSplit[1] || 0),
      second: Number(timeSplit[2] || 0)
    }
  } else {
    time = {
      hour: date.hour(),
      minute: date.minute(),
      second: date.second()
    }
  }

  return override
    ? subtract
      ? standard
        .clone()
        .subtract(Math.floor(time.hour / 24), 'd')
        .hour(
          1 <= time.hour / 24 ? (time.hour / 24 - Math.floor(time.hour / 24)) * 24 : time.hour
        )
        .minute(time.minute)
        .second(time.second)
      : standard
        .clone()
        .hour(time.hour)
        .minute(time.minute)
        .second(time.second)
    : standard
      .clone()
      .add(time.hour, 'h')
      .add(time.minute, 'm')
      .add(time.second, 's')
}

export function convertStringFullWidthToHalfWidth<char extends string | null>(
  char: char
): string | char {
  return typeof char === 'string'
    ? char
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/（(.*)）/, '($1)')
      .replace(/(\S)(?!\s)(\()/, '$1 $2')
      .replace(/(\))(?!\s)(\S)/, '$1 $2')
    : char
}
