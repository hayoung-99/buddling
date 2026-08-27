import { DownloadMobileGate, DownloadPage } from '../../../components/DownloadPage'
import { isMobileRequest } from '../../../lib/device'
import { ko } from '../../../lib/copy.ko'
import { buildDownloadMetadata } from '../../../lib/metadata'
import { fetchReleases } from '../../../lib/releases'
import { DOWNLOAD_PATHS } from '../../../lib/site'

export const metadata = buildDownloadMetadata(ko)

export default async function KoreanDownload() {
  const other = { ...ko.other, href: DOWNLOAD_PATHS.en }

  if (await isMobileRequest()) {
    return <DownloadMobileGate copy={ko} homeHref="/" other={other} />
  }

  const releases = await fetchReleases()
  return <DownloadPage copy={ko} releases={releases} homeHref="/" other={other} />
}
