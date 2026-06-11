import { YoutubeTranscript, YoutubeTranscriptError } from 'youtube-transcript'

/**
 * Resolves YouTube links into their spoken-word transcript.
 *
 * Kept deliberately small: detect whether a string is a YouTube watch link,
 * and (server-side only) pull the caption track and flatten it into plain
 * prose. The raw transcript is messy auto-caption text — downstream the
 * optional AI revision step cleans it up.
 */
export class YoutubeLink {
  /**
   * True when the given string points at a YouTube video we can resolve.
   * Accepts the usual host variants (youtube.com/watch, youtu.be, shorts,
   * m.youtube, with or without protocol).
   */
  static matches(raw: string): boolean {
    const url = raw.trim()
    return /(?:youtube\.com\/(?:watch\?|shorts\/|live\/|embed\/)|youtu\.be\/)/i.test(url)
  }

  /**
   * Fetch the transcript for a YouTube URL and return it as a single
   * whitespace-normalised string. Throws a YoutubeTranscriptError subclass
   * when no transcript can be retrieved (disabled, unavailable, throttled…);
   * the caller maps these to user-facing messages.
   */
  static async fetchTranscriptText(url: string): Promise<string> {
    const segments = await YoutubeTranscript.fetchTranscript(url.trim())
    const text = segments
      .map(segment => segment.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) {
      throw new YoutubeTranscriptError('Empty transcript')
    }
    return text
  }
}
