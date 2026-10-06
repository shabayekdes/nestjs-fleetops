import type { Metadata } from 'next';
import { Notice } from '@/components/notice';
import { PageHeader } from '@/components/page-header';
import { flashMessage } from '@/lib/flash';
import { singleParam } from '@/lib/search-params';
import { PasswordForm } from './_components/password-form';

export const metadata: Metadata = { title: 'Change password' };

export default async function ChangePasswordPage({
  searchParams,
}: PageProps<'/account/password'>) {
  const raw = await searchParams;
  const flash = flashMessage(singleParam(raw.notice));

  return (
    <>
      <PageHeader title="Change password" />
      {flash ? (
        <div className="mb-4 max-w-xl">
          <Notice variant="success">{flash}</Notice>
        </div>
      ) : null}
      <PasswordForm />
    </>
  );
}
