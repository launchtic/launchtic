"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { X, ExternalLink } from "lucide-react";
import ContactNotes from "../contacts/ContactNotes";

type Contact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export default function CardNotesModal({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{name}</h2>
            <p className="text-xs text-gray-400 truncate">{contact.email}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={`/${workspaceSlug}/contacts/${contact.id}`}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Open contact record"
            >
              <ExternalLink size={15} />
            </Link>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          <ContactNotes contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}
