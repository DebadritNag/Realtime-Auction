"use client";

import React, { useState } from "react";
import { User } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Edit2, Shield, User as UserIcon } from "lucide-react";

export interface ProfileHeaderProps {
  user: User;
  onUpdate?: (updated: Partial<User>) => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user,
  onUpdate,
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [teamName, setTeamName] = useState(user.defaultTeamName);
  const [teamLogo, setTeamLogo] = useState(user.defaultTeamLogo);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdate) {
      onUpdate({
        displayName,
        defaultTeamName: teamName,
        defaultTeamLogo: teamLogo,
      });
    }
    setIsEditOpen(false);
  };

  return (
    <div className="rounded-2xl bg-[#0e121a] border border-[#242c3d] p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#00ff87]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-5 relative z-10 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Avatar
            src={user.avatarUrl}
            name={user.displayName}
            size="xl"
            className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-[#00ff87]/40 shadow-[0_0_25px_rgba(0,255,135,0.2)]"
          />

          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-black text-[#f8fafc] tracking-tight">
                {user.displayName}
              </h1>
              <span className="text-xl" title="Default Franchise Logo">
                {user.defaultTeamLogo}
              </span>
            </div>
            <p className="text-xs text-[#64748b] mt-0.5">@{user.username} • {user.email}</p>

            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#151a24] border border-[#242c3d] text-xs font-semibold text-[#cbd5e1]">
                <Shield className="w-3.5 h-3.5 text-[#00ff87]" />
                {user.defaultTeamName}
              </span>
              <span className="text-xs text-[#64748b]">Franchise Owner</span>
            </div>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsEditOpen(true)}
          leftIcon={<Edit2 className="w-3.5 h-3.5" />}
        >
          Edit Profile
        </Button>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Manager Profile"
        description="Update your public display name and default franchise crest"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            leftIcon={<UserIcon className="w-4 h-4" />}
            required
          />

          <Input
            label="Default Team Name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            leftIcon={<Shield className="w-4 h-4" />}
            required
          />

          <Input
            label="Default Franchise Crest (Emoji)"
            value={teamLogo}
            onChange={(e) => setTeamLogo(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#242c3d]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
