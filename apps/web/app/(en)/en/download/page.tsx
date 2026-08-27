import { DownloadMobileGate, DownloadPage } from '../../../../components/DownloadPage'
import { isMobileRequest } from '../../../../lib/device'
import { en } from '../../../../lib/copy.en'
import { buildDownloadMetadata } from '../../../../lib/metadata'
import { fetchReleases } from '../../../../lib/releases'
import { DOWNLOAD_PATHS } from '../../../../lib/site'

export const metadata = buildDownloadMetadata(en)

export default async function EnglishDownload() {
  const other = { ...en.other, href: DOWNLOAD_PATHS.ko }

  if (await isMobileRequest()) {
    return <DownloadMobileGate copy={en} homeHref="/en/" other={other} />
  }

  const releases = await fetchReleases()
  return <DownloadPage copy={en} releases={releases} homeHref="/en/" other={other} />
}
