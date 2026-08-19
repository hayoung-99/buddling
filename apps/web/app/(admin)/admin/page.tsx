import { AdminApp } from '../../../components/admin/AdminApp'

/**
 * 어드민 화면.
 *
 * 여기서는 아무 데이터도 읽지 않는다. 숫자를 받아오는 일은 전부 브라우저에서 일어나고,
 * 이 페이지는 빈 껍데기로 구워진다. 그렇게 한 이유가 둘이다.
 *
 *   1. **빌드가 Supabase 를 필요로 하지 않는다.** CI 에 키를 넣지 않아도 되고,
 *      `npm run check:site` 가 Supabase 없이 돈다
 *   2. 서버에 비밀을 둘 일이 없다. anon 키 하나로 충분하고, 막는 일은 DB 가 한다
 */
export default function AdminPage() {
  return <AdminApp />
}
