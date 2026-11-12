"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  uploadMessagingPhoto,
  type UploadedMessagingAttachment,
} from "./image-upload-client";
import {
  ensureCommunityPresence,
  notifyMessagingSync,
  useCommunityOnlineCount,
} from "./use-messaging-unread";

const MESSENGER_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🔥"] as const;

const COMPOSER_EMOJIS: readonly { emoji: string; label: string }[] = [
  { emoji: "👋", label: "Bienvenue" },
  { emoji: "🎉", label: "Félicitations" },
  { emoji: "👏", label: "Bravo" },
  { emoji: "🔥", label: "Top" },
  { emoji: "❤️", label: "Cœur" },
  { emoji: "👍", label: "Pouce" },
  { emoji: "😊", label: "Sourire" },
  { emoji: "🙌", label: "Super" },
  { emoji: "🚀", label: "Décollage" },
  { emoji: "🤝", label: "Partenariat" },
  { emoji: "💪", label: "Force" },
  { emoji: "✨", label: "Étincelles" },
  { emoji: "🥳", label: "Fête" },
  { emoji: "😍", label: "Adore" },
  { emoji: "😂", label: "Rire" },
  { emoji: "😮", label: "Waouh" },
  { emoji: "🙏", label: "Merci" },
  { emoji: "💯", label: "100 %" },
  { emoji: "🌟", label: "Étoile" },
  { emoji: "🥂", label: "Succès" },
  { emoji: "😉", label: "Clin d’œil" },
  { emoji: "💼", label: "Business" },
  { emoji: "🏆", label: "Trophée" },
  { emoji: "✅", label: "Validé" },
];

const REACTION_META: Record<
  string,
  { label: string; activeClass: string }
> = {
  "👍": {
    label: "J’aime",
    activeClass: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  "❤️": {
    label: "J’adore",
    activeClass: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  },
  "😂": {
    label: "Haha",
    activeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  "😮": {
    label: "Waouh",
    activeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  "👏": {
    label: "Bravo",
    activeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  "🔥": {
    label: "Top",
    activeClass: "bg-orange-50 text-winelio-orange border-winelio-orange/35 dark:bg-orange-950/40",
  },
  "🎉": {
    label: "Bravo",
    activeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  "💡": {
    label: "Idée",
    activeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

const REPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "non_compliant", label: "Message non conforme à la charte Winelio" },
  { value: "spam", label: "Spam ou démarchage extérieur" },
  { value: "personal_data", label: "Coordonnées privées d’un client ou prospect (RGPD)" },
  { value: "inappropriate", label: "Propos irrespectueux ou inappropriés" },
  { value: "misleading", label: "Information trompeuse sur Winelio" },
];

type FeedFilter = "all" | "official" | "community" | "welcome";
type ModerationState = "active" | "masked_admin" | "deleted_author" | "deleted_admin";

type ChannelItem = {
  id: string;
  kind: "announcements" | "lineage" | "team";
  slug: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  isMemberChannel: boolean;
  role: "member" | "moderator" | "owner";
  memberCount: number;
  allowMemberPhotos: boolean;
  canPostTopLevel: boolean;
  canPostOfficialAnnouncement?: boolean;
  canModerate: boolean;
  canPin: boolean;
  canUploadPhoto: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastReadAt: string | null;
  mutedUntil: string | null;
  isMuted: boolean;
  hasUnread: boolean;
  activeRestriction: { until: string; reason: string | null } | null;
};

type MessageAttachment = {
  key: string;
  url: string;
  mime: string;
  width?: number;
  height?: number;
};

type MessageItem = {
  id: string;
  channelId: string;
  messageType?: "announcement" | "post" | "welcome";
  parentMessageId: string | null;
  parentPreview: {
    id: string;
    authorName: string;
    excerpt: string;
  } | null;
  author: {
    id: string | null;
    displayName: string;
    avatar: string | null;
    badge: string;
  };
  isOwn: boolean;
  title: string | null;
  content: string;
  attachments: MessageAttachment[];
  commentsEnabled: boolean;
  replyCount: number;
  isDeleted: boolean;
  moderationState?: ModerationState;
  moderatedAt?: string | null;
  moderationReason?: string | null;
  archivedContent?: string | null;
  pendingReportCount?: number;
  isPinned: boolean;
  editedAt: string | null;
  createdAt: string;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  myReaction?: string | null;
  totalReactions?: number;
  reactorPreview?: string[];
};

type ReactorItem = {
  userId: string;
  displayName: string;
  avatar: string | null;
  badge: string;
  emoji: string;
  isViewer: boolean;
  createdAt: string;
};

type ReactionsDetailState = {
  total: number;
  counts: { emoji: string; count: number }[];
  reactors: ReactorItem[];
};

type PreferencesState = {
  inAppBadges: boolean;
  emailMajorAnnouncements: boolean;
  charterAcceptedAt: string | null;
};

function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderRoleBadge(badge: string, messageType?: MessageItem["messageType"]) {
  if (badge === "welcome" || messageType === "welcome") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
        👋 Nouveau membre
      </span>
    );
  }
  if (messageType === "announcement") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-winelio-orange to-winelio-amber text-white">
        📢 Annonce officielle
      </span>
    );
  }
  if (badge === "admin") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-winelio-orange">
        Équipe Winelio
      </span>
    );
  }
  if (badge === "founder") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
        Fondateur
      </span>
    );
  }
  if (badge === "leader") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-winelio-orange">
        Animateur réseau
      </span>
    );
  }
  if (badge === "pro") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        Pro
      </span>
    );
  }
  return null;
}

function applyOptimisticSingleReaction(msg: MessageItem, clickedEmoji: string): MessageItem {
  const prevEmoji =
    msg.myReaction ?? msg.reactions.find((r) => r.reacted)?.emoji ?? null;
  const map = new Map<string, { emoji: string; count: number; reacted: boolean }>();

  for (const r of msg.reactions) {
    map.set(r.emoji, { ...r, reacted: false });
  }

  let nextMyReaction: string | null = null;

  if (prevEmoji === clickedEmoji) {
    // Retrait de la réaction existante
    const cur = map.get(clickedEmoji);
    if (cur) {
      if (cur.count <= 1) map.delete(clickedEmoji);
      else map.set(clickedEmoji, { emoji: clickedEmoji, count: cur.count - 1, reacted: false });
    }
    nextMyReaction = null;
  } else {
    // Retirer l'ancienne réaction s'il y en avait une autre
    if (prevEmoji) {
      const old = map.get(prevEmoji);
      if (old) {
        if (old.count <= 1) map.delete(prevEmoji);
        else map.set(prevEmoji, { emoji: prevEmoji, count: old.count - 1, reacted: false });
      }
    }
    // Appliquer la nouvelle réaction unique
    const next = map.get(clickedEmoji);
    map.set(clickedEmoji, {
      emoji: clickedEmoji,
      count: (next?.count ?? 0) + 1,
      reacted: true,
    });
    nextMyReaction = clickedEmoji;
  }

  const nextReactions = Array.from(map.values()).sort((a, b) => b.count - a.count);
  const nextTotal = nextReactions.reduce((acc, item) => acc + item.count, 0);
  const otherNames = (msg.reactorPreview ?? []).filter((n) => n !== "Vous");
  const nextPreview = nextMyReaction
    ? ["Vous", ...otherNames].slice(0, 3)
    : otherNames.slice(0, 3);

  return {
    ...msg,
    reactions: nextReactions,
    myReaction: nextMyReaction,
    totalReactions: nextTotal,
    reactorPreview: nextPreview,
  };
}

function formatReactionSummaryText(msg: MessageItem, total: number, compact: boolean): string {
  if (compact || total <= 0) return String(total);
  const names = (msg.reactorPreview ?? []).filter(Boolean);
  if (names.length === 0) return String(total);
  if (total === 1) return names[0];
  if (total === 2) {
    return names.length >= 2 ? `${names[0]} et ${names[1]}` : `${names[0]} et 1 autre`;
  }
  const shown = names.slice(0, 2);
  const remaining = total - shown.length;
  if (remaining <= 0) return shown.join(", ");
  return `${shown.join(", ")} et ${remaining} autre${remaining > 1 ? "s" : ""}`;
}

export interface MessagingWorkspaceProps {
  variant?: "full" | "dashboard";
  dashboardLimit?: number;
}

export function MessagingWorkspace({
  variant = "full",
  dashboardLimit = 5,
}: MessagingWorkspaceProps) {
  const instanceId = useId().replace(/:/g, "");
  const mutePopoverId = `msg-mute-${instanceId}`;
  const composerHeadingId = `msg-composer-heading-${instanceId}`;
  const composerTitleId = `msg-composer-title-${instanceId}`;
  const composerBodyId = `msg-composer-body-${instanceId}`;
  const reportDetailsId = `msg-report-details-${instanceId}`;

  const isDashboard = variant === "dashboard";
  const onlineCount = useCommunityOnlineCount();

  const [loadingChannels, setLoadingChannels] = useState(true);
  const [eligible, setEligible] = useState(true);
  const [groupsEnabled, setGroupsEnabled] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [preferences, setPreferences] = useState<PreferencesState | null>(null);

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [pins, setPins] = useState<MessageItem[]>([]);
  const [pinsExpanded, setPinsExpanded] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Composer "+ Nouveau message" / "Annonce officielle"
  const [showComposer, setShowComposer] = useState(false);
  const [pendingOpenComposerAfterCharter, setPendingOpenComposerAfterCharter] = useState(false);
  const [composerIsOfficial, setComposerIsOfficial] = useState(true);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerCommentsEnabled, setComposerCommentsEnabled] = useState(true);
  const [composerPhotos, setComposerPhotos] = useState<UploadedMessagingAttachment[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState("");

  // Sélecteur de réaction style Messenger, palette d'émoticônes & menu d'actions ⋯
  const [openReactionForId, setOpenReactionForId] = useState<string | null>(null);
  const [openMenuForId, setOpenMenuForId] = useState<string | null>(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<
    "reply" | "composer" | "edit" | null
  >(null);
  const [expandedArchivedIds, setExpandedArchivedIds] = useState<Record<string, boolean>>({});
  const hoverCloseTimerRef = useRef<number | null>(null);

  // Édition d'un message
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);
  const [editText, setEditText] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Confirmation suppression / masquage avec motif optionnel
  const [moderationDialog, setModerationDialog] = useState<{
    target: MessageItem;
    mode: "delete" | "mask";
  } | null>(null);
  const [moderationReasonInput, setModerationReasonInput] = useState("");
  const [submittingModeration, setSubmittingModeration] = useState(false);

  // Tiroir de réponses regroupées (Sheet latéral)
  const [threadParent, setThreadParent] = useState<MessageItem | null>(null);
  const [threadReplies, setThreadReplies] = useState<MessageItem[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadInput, setThreadInput] = useState("");
  const [sendingThread, setSendingThread] = useState(false);

  // Lightbox photo
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Charte communautaire
  const [charterOpen, setCharterOpen] = useState(false);
  const [acceptingCharter, setAcceptingCharter] = useState(false);

  // Signalement non conforme (étudié par les 3 Super Admins)
  const [reportTarget, setReportTarget] = useState<MessageItem | null>(null);
  const [reportReason, setReportReason] = useState("non_compliant");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [toastBanner, setToastBanner] = useState("");

  // Modale « Qui a réagi » style Facebook / Messenger
  const [reactionsModalTarget, setReactionsModalTarget] = useState<MessageItem | null>(null);
  const [reactionsDetail, setReactionsDetail] = useState<ReactionsDetailState | null>(null);
  const [loadingReactionsDetail, setLoadingReactionsDetail] = useState(false);
  const [activeReactionTab, setActiveReactionTab] = useState<string>("all");
  const reactionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mutePopoverRef = useRef<HTMLDivElement | null>(null);
  const hasOpenPopoverRef = useRef(false);
  hasOpenPopoverRef.current = Boolean(
    openReactionForId || openMenuForId || emojiPickerTarget,
  );
  const threadParentRef = useRef<MessageItem | null>(null);
  threadParentRef.current = threadParent;
  const feedFilterRef = useRef<FeedFilter>("all");
  feedFilterRef.current = feedFilter;

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
    window.setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? "" : prev));
    }, 3800);
  }, []);

  // Fermer les popovers légers avec Échap (sans fermer le tiroir parent) ou clic extérieur
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && hasOpenPopoverRef.current) {
        e.stopPropagation();
        setOpenReactionForId(null);
        setOpenMenuForId(null);
        setEmojiPickerTarget(null);
      }
    }
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-msg-popover-root]")) {
        setOpenReactionForId(null);
        setOpenMenuForId(null);
        setEmojiPickerTarget(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const loadChannels = useCallback(async (preserveActive = true) => {
    try {
      const res = await fetch("/api/messaging/channels", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        eligible: boolean;
        currentUserId?: string;
        groupsEnabled?: boolean;
        isSuperAdmin?: boolean;
        pendingReportCount?: number;
        channels: ChannelItem[];
        preferences: PreferencesState | null;
      };
      setEligible(data.eligible);
      if (data.eligible && data.currentUserId) {
        ensureCommunityPresence(data.currentUserId);
      }
      setGroupsEnabled(Boolean(data.groupsEnabled));
      const superAdminFlag = Boolean(data.isSuperAdmin);
      setIsSuperAdmin(superAdminFlag);
      setComposerIsOfficial(superAdminFlag);
      setPendingReportCount(data.pendingReportCount ?? 0);
      setChannels(data.channels ?? []);
      setPreferences(data.preferences);

      if (
        !isDashboard &&
        data.preferences &&
        !data.preferences.charterAcceptedAt &&
        !superAdminFlag
      ) {
        setCharterOpen(true);
      }

      setActiveChannelId((prev) => {
        if (preserveActive && prev && data.channels.some((c) => c.id === prev)) {
          return prev;
        }
        const firstUnread = data.channels.find((c) => c.hasUnread && !c.isMuted);
        return firstUnread?.id ?? data.channels[0]?.id ?? null;
      });
    } finally {
      setLoadingChannels(false);
    }
  }, [isDashboard]);

  const pageSize = isDashboard ? dashboardLimit : 30;

  const loadMessages = useCallback(
    async (channelId: string, filter: FeedFilter = "all", silent = false) => {
      if (!silent) setLoadingMessages(true);
      try {
        const filterParam = filter === "all" ? "" : `&filter=${filter}`;
        const markReadParam = isDashboard ? "&markRead=0" : "";
        const res = await fetch(
          `/api/messaging/channels/${channelId}/messages?limit=${pageSize}${filterParam}${markReadParam}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: MessageItem[];
          pins: MessageItem[];
          hasMore: boolean;
          nextCursor: string | null;
        };
        setMessages(data.messages ?? []);
        setPins(data.pins ?? []);
        setHasMore(Boolean(data.hasMore));
        setNextCursor(data.nextCursor ?? null);

        if (!isDashboard) {
          setChannels((prev) =>
            prev.map((c) => (c.id === channelId ? { ...c, hasUnread: false } : c)),
          );
          notifyMessagingSync();
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [isDashboard, pageSize],
  );

  const loadThread = useCallback(
    async (channelId: string, parentId: string, silent = false) => {
      if (!silent) setLoadingThread(true);
      try {
        const res = await fetch(
          `/api/messaging/channels/${channelId}/messages?parentId=${parentId}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          parent: MessageItem;
          replies: MessageItem[];
        };
        setThreadParent(data.parent);
        setThreadReplies(data.replies ?? []);
      } finally {
        if (!silent) setLoadingThread(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadChannels(false);
  }, [loadChannels]);

  useEffect(() => {
    if (!activeChannelId) return;
    setComposerPhotos([]);
    setComposerError("");
    void loadMessages(activeChannelId, feedFilter, false);
  }, [activeChannelId, feedFilter, loadMessages]);

  // Abonnement temps réel Supabase Broadcast
  useEffect(() => {
    if (!activeChannelId) return;
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel(`winelio-msg:${activeChannelId}`)
      .on("broadcast", { event: "messaging_update" }, () => {
        void loadMessages(activeChannelId, feedFilterRef.current, true);
        if (threadParentRef.current) {
          void loadThread(activeChannelId, threadParentRef.current.id, true);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [activeChannelId, loadMessages, loadThread]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  function ensureCharterBeforeAction(onReady: () => void) {
    if (!isSuperAdmin && preferences && !preferences.charterAcceptedAt) {
      setPendingOpenComposerAfterCharter(true);
      setCharterOpen(true);
      return;
    }
    onReady();
  }

  function handleClickNewMessage() {
    if (showComposer) {
      setEmojiPickerTarget((prev) => (prev === "composer" ? null : prev));
      setShowComposer(false);
      return;
    }
    ensureCharterBeforeAction(() => {
      setComposerIsOfficial(isSuperAdmin);
      setShowComposer(true);
    });
  }

  function insertEmojiAtCursor(
    target: "reply" | "composer" | "edit",
    emoji: string,
  ) {
    const el =
      target === "reply"
        ? replyInputRef.current
        : target === "composer"
        ? composerTextareaRef.current
        : editTextareaRef.current;
    const current =
      target === "reply"
        ? threadInput
        : target === "composer"
        ? composerText
        : editText;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emoji + current.slice(end);
    if (next.length > 2000) return;

    if (target === "reply") {
      setThreadInput(next);
    } else if (target === "composer") {
      setComposerText(next);
      if (composerError) setComposerError("");
    } else {
      setEditText(next);
    }

    const nextCaret = start + emoji.length;
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function renderEmojiPalette(
    target: "reply" | "composer" | "edit",
    placementClass: string,
  ) {
    if (emojiPickerTarget !== target) return null;
    return (
      <div
        role="group"
        aria-label="Choisir une émoticône à insérer"
        className={`msg-emoji-popover ${placementClass} rounded-2xl border border-gray-200 bg-white dark:bg-slate-800 p-2.5 z-40`}
      >
        <div className="flex items-center justify-between px-1 pb-1.5 mb-1.5 border-b border-gray-100 dark:border-slate-700">
          <span className="text-[11px] font-semibold text-winelio-gray">
            Émoticônes
          </span>
          <button
            type="button"
            aria-label="Fermer le sélecteur d’émoticônes"
            onClick={() => setEmojiPickerTarget(null)}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-winelio-gray hover:text-winelio-dark hover:bg-gray-100 transition"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="msg-emoji-grid">
          {COMPOSER_EMOJIS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              aria-label={`${item.emoji} ${item.label}`}
              title={item.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertEmojiAtCursor(target, item.emoji)}
              className="msg-emoji-btn focus-visible:outline-2 focus-visible:outline-winelio-orange"
            >
              <span aria-hidden="true">{item.emoji}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  async function handleAcceptCharter() {
    setAcceptingCharter(true);
    try {
      const res = await fetch("/api/messaging/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptCharter: true }),
      });
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setPreferences((prev) =>
          prev
            ? { ...prev, charterAcceptedAt: nowIso }
            : { inAppBadges: true, emailMajorAnnouncements: true, charterAcceptedAt: nowIso },
        );
        setCharterOpen(false);
        if (pendingOpenComposerAfterCharter) {
          setPendingOpenComposerAfterCharter(false);
          setShowComposer(true);
        }
      }
    } finally {
      setAcceptingCharter(false);
    }
  }

  async function handleLoadOlder() {
    if (!activeChannel || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const filterParam = feedFilter === "all" ? "" : `&filter=${feedFilter}`;
      const res = await fetch(
        `/api/messaging/channels/${activeChannel.id}/messages?limit=${pageSize}${filterParam}&before=${encodeURIComponent(
          nextCursor,
        )}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: MessageItem[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setMessages((prev) => [...prev, ...(data.messages ?? [])]);
      setHasMore(Boolean(data.hasMore));
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSelectPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeChannel) return;
    if (composerPhotos.length >= 3) {
      setComposerError("Maximum 3 photos par message.");
      return;
    }

    setUploadingPhoto(true);
    setComposerError("");
    try {
      const uploaded = await uploadMessagingPhoto(activeChannel.id, file);
      setComposerPhotos((prev) => [...prev, uploaded]);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Impossible d’ajouter cette photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSendMain(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannel || sending) return;

    const trimmed = composerText.trim();
    if (!trimmed && composerPhotos.length === 0) {
      setComposerError("Veuillez écrire votre message ou ajouter une photo.");
      return;
    }

    setSending(true);
    setComposerError("");
    try {
      const res = await fetch(`/api/messaging/channels/${activeChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          isOfficialAnnouncement: isSuperAdmin ? composerIsOfficial : false,
          title: isSuperAdmin && composerIsOfficial ? composerTitle.trim() || null : null,
          commentsEnabled: isSuperAdmin && composerIsOfficial ? composerCommentsEnabled : true,
          attachments: composerPhotos.map((p) => ({
            key: p.key,
            mime: p.mime,
            width: p.width,
            height: p.height,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: MessageItem;
      };

      if (!res.ok) {
        if (data.error?.includes("charte")) {
          setPendingOpenComposerAfterCharter(true);
          setCharterOpen(true);
        }
        setComposerError(data.error || "Envoi impossible.");
        return;
      }

      setComposerText("");
      setComposerTitle("");
      setComposerPhotos([]);
      setEmojiPickerTarget(null);
      setShowComposer(false);
      showToast(
        isSuperAdmin && composerIsOfficial
          ? "📢 Annonce officielle diffusée à toute la communauté Winelio."
          : "✅ Message publié dans la communauté Winelio.",
      );
      await loadMessages(activeChannel.id, feedFilter, true);
      notifyMessagingSync();
    } finally {
      setSending(false);
    }
  }

  async function handleSendThreadReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannel || !threadParent || sendingThread) return;
    const trimmed = threadInput.trim();
    if (!trimmed) return;

    setSendingThread(true);
    try {
      const res = await fetch(`/api/messaging/channels/${activeChannel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          parentMessageId: threadParent.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        if (data.error?.includes("charte")) {
          setCharterOpen(true);
        } else {
          showToast(data.error || "Impossible d’envoyer le commentaire.");
        }
        return;
      }
      setThreadInput("");
      setEmojiPickerTarget((prev) => (prev === "reply" ? null : prev));
      await Promise.all([
        loadThread(activeChannel.id, threadParent.id, true),
        loadMessages(activeChannel.id, feedFilter, true),
      ]);
    } finally {
      setSendingThread(false);
    }
  }

  async function handleSetReaction(target: MessageItem, emoji: string) {
    setOpenReactionForId(null);

    setMessages((prev) =>
      prev.map((m) => (m.id === target.id ? applyOptimisticSingleReaction(m, emoji) : m)),
    );
    setThreadReplies((prev) =>
      prev.map((m) => (m.id === target.id ? applyOptimisticSingleReaction(m, emoji) : m)),
    );

    const res = await fetch(`/api/messaging/messages/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_reaction", emoji }),
    });
    if (!res.ok && activeChannel) {
      void loadMessages(activeChannel.id, feedFilter, true);
      if (threadParent) {
        void loadThread(activeChannel.id, threadParent.id, true);
      }
    }
  }

  async function openReactionsModal(msg: MessageItem, initialTab = "all") {
    setOpenReactionForId(null);
    setOpenMenuForId(null);
    setReactionsModalTarget(msg);
    setActiveReactionTab(initialTab);
    setReactionsDetail(null);
    setLoadingReactionsDetail(true);

    try {
      const res = await fetch(`/api/messaging/messages/${msg.id}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ReactionsDetailState;
      setReactionsDetail(data);
    } finally {
      setLoadingReactionsDetail(false);
    }
  }

  async function handleRemoveOwnReactionFromModal(emoji: string) {
    if (!reactionsModalTarget) return;
    const targetMsg = reactionsModalTarget;

    // Mise à jour optimiste immédiate dans la modale
    setReactionsDetail((prev) => {
      if (!prev) return prev;
      const nextReactors = prev.reactors.filter((r) => !r.isViewer);
      const nextCounts = prev.counts
        .map((c) => (c.emoji === emoji ? { ...c, count: c.count - 1 } : c))
        .filter((c) => c.count > 0);
      if (nextReactors.length === 0) {
        setReactionsModalTarget(null);
      } else if (
        activeReactionTab !== "all" &&
        !nextCounts.some((c) => c.emoji === activeReactionTab)
      ) {
        setActiveReactionTab("all");
      }
      return {
        total: nextReactors.length,
        counts: nextCounts,
        reactors: nextReactors,
      };
    });

    await handleSetReaction(targetMsg, emoji);
  }

  function handleReactionTabKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    tabKeys: string[],
  ) {
    if (tabKeys.length <= 1) return;
    const idx = Math.max(0, tabKeys.indexOf(activeReactionTab));
    let nextIdx: number | null = null;

    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabKeys.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabKeys.length) % tabKeys.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = tabKeys.length - 1;

    if (nextIdx === null) return;
    e.preventDefault();
    const nextKey = tabKeys[nextIdx];
    setActiveReactionTab(nextKey);
    const btn = reactionTabRefs.current[nextKey];
    btn?.focus();
    btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  async function handleTogglePin(msg: MessageItem) {
    setOpenMenuForId(null);
    const res = await fetch(`/api/messaging/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_pin" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; pinned?: boolean };
    if (!res.ok) {
      showToast(data.error || "Impossible de modifier l’épingle.");
      return;
    }
    showToast(data.pinned ? "📌 Publication épinglée en haut." : "Publication désépinglée.");
    if (activeChannel) {
      await loadMessages(activeChannel.id, feedFilter, true);
    }
  }

  async function handleToggleComments(msg: MessageItem) {
    setOpenMenuForId(null);
    const res = await fetch(`/api/messaging/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_comments" }),
    });
    if (res.ok && activeChannel) {
      await loadMessages(activeChannel.id, feedFilter, true);
    }
  }

  async function handleRestoreMaskedMessage(msg: MessageItem) {
    const res = await fetch(`/api/messaging/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (res.ok && activeChannel) {
      showToast("↩️ Message restauré et à nouveau visible.");
      await loadMessages(activeChannel.id, feedFilter, true);
      if (threadParent) {
        await loadThread(activeChannel.id, threadParent.id, true);
      }
    }
  }

  async function handleConfirmModerationAction(e: React.FormEvent) {
    e.preventDefault();
    if (!moderationDialog || submittingModeration) return;
    const { target, mode } = moderationDialog;
    setSubmittingModeration(true);
    try {
      const res =
        mode === "mask"
          ? await fetch(`/api/messaging/messages/${target.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "mask",
                reason:
                  moderationReasonInput.trim() ||
                  "Contenu non conforme à la charte communautaire Winelio",
              }),
            })
          : await fetch(`/api/messaging/messages/${target.id}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reason: moderationReasonInput.trim() || undefined,
              }),
            });

      if (res.ok && activeChannel) {
        setModerationDialog(null);
        setModerationReasonInput("");
        showToast(
          mode === "mask"
            ? "🛡️ Message masqué avec trace visible dans le fil."
            : "🗑️ Message supprimé (trace conservée dans le fil).",
        );
        await loadMessages(activeChannel.id, feedFilter, true);
        if (threadParent) {
          await loadThread(activeChannel.id, threadParent.id, true);
        }
      }
    } finally {
      setSubmittingModeration(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMessage || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/messaging/messages/${editingMessage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          content: editText.trim(),
          title: editingMessage.messageType === "announcement" ? editTitle.trim() || null : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error || "Modification impossible.");
        return;
      }
      setEditingMessage(null);
      if (activeChannel) {
        await loadMessages(activeChannel.id, feedFilter, true);
        if (threadParent) {
          await loadThread(activeChannel.id, threadParent.id, true);
        }
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTarget || submittingReport) return;
    setSubmittingReport(true);
    try {
      const res = await fetch(`/api/messaging/messages/${reportTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          reason: reportReason,
          details: reportDetails.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error || "Signalement impossible.");
        return;
      }
      setReportTarget(null);
      setReportDetails("");
      showToast("🚩 Signalement transmis aux 3 Super Admins Winelio pour examen.");
      if (isSuperAdmin) {
        setPendingReportCount((n) => n + 1);
      }
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleMuteChange(muteValue: "off" | "1h" | "24h" | "forever") {
    if (!activeChannel) return;
    mutePopoverRef.current?.hidePopover?.();
    const res = await fetch("/api/messaging/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: activeChannel.id, mute: muteValue }),
    });
    if (res.ok) {
      await loadChannels(true);
      notifyMessagingSync();
      showToast(
        muteValue === "off"
          ? "🔔 Notifications réactivées."
          : "🔕 Espace mis en sourdine.",
      );
    }
  }

  function canEditMessage(msg: MessageItem): boolean {
    if (msg.isDeleted || msg.messageType === "welcome") return false;
    if (isSuperAdmin && msg.isOwn) return true;
    if (!msg.isOwn) return false;
    return Date.now() - new Date(msg.createdAt).getTime() <= EDIT_WINDOW_MS;
  }

  function openThreadDrawer(msg: MessageItem) {
    if (!activeChannel) return;
    setEmojiPickerTarget(null);
    setThreadParent(msg);
    setThreadReplies([]);
    void loadThread(activeChannel.id, msg.id, false);
  }

  function openReactionTrayOnHover(id: string, pointerType: string) {
    if (pointerType !== "mouse") return;
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setOpenReactionForId(id);
  }

  function scheduleCloseReactionTray(pointerType: string) {
    if (pointerType !== "mouse") return;
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setOpenReactionForId(null);
    }, 220);
  }

  function renderModerationTrace(msg: MessageItem, compact = false) {
    const state: ModerationState =
      msg.moderationState || (msg.isDeleted ? "deleted_admin" : "active");
    const timeStr = formatShortTime(msg.moderatedAt || msg.createdAt);
    const isArchivedOpen = Boolean(expandedArchivedIds[msg.id]);

    let icon = "🗑️";
    let label = "Ce message a été supprimé.";
    let badgeTone = "bg-gray-100/90 border-gray-200 text-winelio-gray";

    if (state === "deleted_author") {
      icon = "🗑️";
      label = `Message supprimé par son auteur (${msg.author.displayName})`;
      badgeTone = "bg-gray-50 border-gray-200/80 text-winelio-gray";
    } else if (state === "masked_admin") {
      icon = "🛡️";
      label = "Message masqué par la modération Winelio";
      badgeTone = "bg-amber-50/80 border-amber-200/80 text-amber-900";
    } else if (state === "deleted_admin") {
      icon = "🚫";
      label = "Message supprimé par la modération Winelio";
      badgeTone = "bg-red-50/60 border-red-200/70 text-red-900";
    }

    return (
      <div
        className={`rounded-2xl border ${badgeTone} ${
          compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-xs sm:text-sm"
        } space-y-2`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true">{icon}</span>
            <span className="font-medium italic">
              {label}
              {msg.moderationReason && state !== "deleted_author"
                ? ` — ${msg.moderationReason}`
                : ""}
            </span>
          </div>
          {timeStr && <span className="text-[11px] opacity-75 shrink-0">{timeStr}</span>}
        </div>

        {isSuperAdmin && state === "masked_admin" && (
          <div className="pt-1 border-t border-amber-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {msg.archivedContent && (
                <button
                  type="button"
                  aria-expanded={isArchivedOpen}
                  onClick={() =>
                    setExpandedArchivedIds((prev) => ({
                      ...prev,
                      [msg.id]: !prev[msg.id],
                    }))
                  }
                  className="font-semibold text-amber-900 underline"
                >
                  {isArchivedOpen
                    ? "Masquer l’archive Super Admin"
                    : "👁️ Voir le contenu archivé (3 Super Admins)"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRestoreMaskedMessage(msg)}
                className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100/50"
              >
                ↩️ Restaurer
              </button>
              <button
                type="button"
                onClick={() => {
                  setModerationReasonInput(msg.moderationReason ?? "");
                  setModerationDialog({ target: msg, mode: "delete" });
                }}
                className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        )}

        {isSuperAdmin && state === "masked_admin" && isArchivedOpen && msg.archivedContent && (
          <div className="rounded-xl bg-white/90 p-2.5 text-xs text-winelio-dark border border-amber-200 whitespace-pre-wrap">
            <span className="block text-[10px] font-bold uppercase text-amber-800 mb-1">
              Archive confidentielle réservée aux 3 Super Admins :
            </span>
            {msg.archivedContent}
          </div>
        )}
      </div>
    );
  }

  function renderMessengerReactionControl(msg: MessageItem, compact = false) {
    const myEmoji =
      msg.myReaction ?? msg.reactions.find((r) => r.reacted)?.emoji ?? null;
    const myMeta = myEmoji ? REACTION_META[myEmoji] : null;
    const total =
      msg.totalReactions ?? msg.reactions.reduce((acc, r) => acc + r.count, 0);
    const isTrayOpen = openReactionForId === msg.id;

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div
          data-msg-popover-root
          className="relative inline-flex items-center"
          onPointerEnter={(e) => openReactionTrayOnHover(msg.id, e.pointerType)}
          onPointerLeave={(e) => scheduleCloseReactionTray(e.pointerType)}
        >
          {/* Palette flottante style Messenger / Facebook (1 seule réaction à la fois) */}
          {isTrayOpen && (
            <div
              role="group"
              aria-label="Choisir une réaction"
              className="msg-reaction-tray absolute bottom-full left-0 mb-2 rounded-full bg-white dark:bg-slate-800 border border-gray-200/90 shadow-xl px-2 py-1.5 flex items-center gap-1 z-30"
            >
              {MESSENGER_EMOJIS.map((emoji) => {
                const selected = myEmoji === emoji;
                const label = REACTION_META[emoji]?.label ?? emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    onClick={() => void handleSetReaction(msg, emoji)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xl transition-transform hover:scale-125 focus-visible:scale-125 active:scale-95 ${
                      selected ? "bg-winelio-orange/15 ring-2 ring-winelio-orange" : "hover:bg-gray-100"
                    }`}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Bouton principal J'aime (clic direct = 👍 ou retrait de la réaction active) */}
          <div className="inline-flex items-center rounded-full border border-gray-200/90 bg-white overflow-hidden shadow-2xs">
            <button
              type="button"
              aria-pressed={Boolean(myEmoji)}
              onClick={() => void handleSetReaction(msg, myEmoji ?? "👍")}
              className={`inline-flex items-center gap-1.5 font-semibold transition ${
                compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
              } ${
                myMeta
                  ? myMeta.activeClass
                  : "text-winelio-gray hover:text-winelio-dark hover:bg-gray-50"
              }`}
            >
              <span aria-hidden="true" className={compact ? "text-xs" : "text-sm"}>
                {myEmoji ?? "👍"}
              </span>
              <span>{myMeta ? myMeta.label : "J’aime"}</span>
            </button>
            <button
              type="button"
              aria-label="Choisir une autre émotion"
              aria-expanded={isTrayOpen}
              onClick={() =>
                setOpenReactionForId((prev) => (prev === msg.id ? null : msg.id))
              }
              className={`border-l border-gray-200/80 text-winelio-gray hover:text-winelio-dark hover:bg-gray-50 transition ${
                compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 text-xs"
              }`}
              title="Choisir 👍 ❤️ 😂 😮 👏 🔥"
            >
              <span aria-hidden="true">▾</span>
            </button>
          </div>
        </div>

        {/* Pilule « Voir qui a réagi » style Facebook / Messenger (emojis empilés + noms + clic détail) */}
        {total > 0 && (() => {
          const summaryLabel = formatReactionSummaryText(msg, total, compact);
          return (
            <button
              type="button"
              onClick={() => void openReactionsModal(msg)}
              title={`${summaryLabel} — Cliquez pour voir qui a réagi`}
              aria-label={`Voir qui a réagi (${total} réaction${total > 1 ? "s" : ""} : ${summaryLabel})`}
              className={`group/reactpill inline-flex items-center gap-1.5 rounded-full border border-gray-200/85 bg-gray-50/95 hover:border-winelio-orange/35 hover:bg-orange-50/60 dark:bg-slate-800/80 dark:border-slate-700 text-xs font-medium text-winelio-dark dark:text-slate-100 shadow-2xs transition cursor-pointer ${
                compact ? "px-2 py-0.5" : "px-2.5 py-1 min-h-8"
              }`}
            >
              <span className="inline-flex items-center -space-x-1 shrink-0" aria-hidden="true">
                {msg.reactions.slice(0, 3).map((r) => (
                  <span
                    key={r.emoji}
                    className={`inline-flex items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-1 ring-gray-200/90 dark:ring-slate-700 shadow-2xs ${
                      compact ? "w-4 h-4 text-[10px]" : "w-4.5 h-4.5 text-[11px]"
                    }`}
                  >
                    {r.emoji}
                  </span>
                ))}
              </span>
              <span
                className={`truncate group-hover/reactpill:text-winelio-orange group-hover/reactpill:underline underline-offset-2 ${
                  compact
                    ? "tabular-nums font-semibold"
                    : "max-w-[205px] sm:max-w-[300px]"
                }`}
              >
                {summaryLabel}
              </span>
            </button>
          );
        })()}
      </div>
    );
  }

  function renderActionMenu(msg: MessageItem) {
    if (msg.isDeleted) return null;
    const isMenuOpen = openMenuForId === msg.id;
    const canEdit = canEditMessage(msg);
    const canDelete = msg.isOwn || Boolean(activeChannel?.canModerate);
    const canMask = Boolean(activeChannel?.canModerate);
    const canReport = !msg.isOwn;
    const canPin = Boolean(activeChannel?.canPin) && !msg.parentMessageId && msg.messageType !== "welcome";

    if (!canEdit && !canDelete && !canMask && !canReport && !canPin) return null;

    return (
      <div data-msg-popover-root className="relative shrink-0">
        <button
          type="button"
          aria-label="Actions sur ce message"
          aria-expanded={isMenuOpen}
          onClick={() => setOpenMenuForId((prev) => (prev === msg.id ? null : msg.id))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-winelio-gray hover:text-winelio-dark hover:bg-gray-100 transition"
        >
          <span aria-hidden="true" className="font-bold leading-none">
            ⋯
          </span>
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-2xl border border-gray-200 bg-white dark:bg-slate-800 p-1.5 shadow-xl z-30 text-xs">
            {canPin && (
              <button
                type="button"
                onClick={() => void handleTogglePin(msg)}
                className="w-full text-left px-3 py-2 rounded-xl font-medium text-winelio-dark hover:bg-gray-100 flex items-center gap-2"
              >
                <span aria-hidden="true">📌</span>
                <span>{msg.isPinned ? "Désépingler" : "Épingler en haut"}</span>
              </button>
            )}

            {isSuperAdmin && !msg.parentMessageId && (
              <button
                type="button"
                onClick={() => void handleToggleComments(msg)}
                className="w-full text-left px-3 py-2 rounded-xl font-medium text-winelio-dark hover:bg-gray-100 flex items-center gap-2"
              >
                <span aria-hidden="true">{msg.commentsEnabled ? "🔒" : "🔓"}</span>
                <span>
                  {msg.commentsEnabled ? "Fermer les commentaires" : "Ouvrir les commentaires"}
                </span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuForId(null);
                  setEditingMessage(msg);
                  setEditTitle(msg.title ?? "");
                  setEditText(msg.content);
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-medium text-winelio-dark hover:bg-gray-100 flex items-center gap-2"
              >
                <span aria-hidden="true">✏️</span>
                <span>Modifier le message</span>
              </button>
            )}

            {canReport && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuForId(null);
                  setReportTarget(msg);
                  setReportReason("non_compliant");
                  setReportDetails("");
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-medium text-amber-800 hover:bg-amber-50 flex items-center gap-2"
              >
                <span aria-hidden="true">🚩</span>
                <span>Signaler (non conforme)</span>
              </button>
            )}

            {canMask && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuForId(null);
                  setModerationReasonInput("Contenu non conforme à la charte Winelio");
                  setModerationDialog({ target: msg, mode: "mask" });
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-medium text-amber-900 hover:bg-amber-50 flex items-center gap-2"
              >
                <span aria-hidden="true">🛡️</span>
                <span>Masquer (laisser une trace)</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuForId(null);
                  setModerationReasonInput("");
                  setModerationDialog({ target: msg, mode: "delete" });
                }}
                className="w-full text-left px-3 py-2 rounded-xl font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <span aria-hidden="true">🗑️</span>
                <span>
                  {msg.isOwn ? "Supprimer mon message" : "Supprimer (modération)"}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loadingChannels) {
    return (
      <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm animate-pulse space-y-3">
        <div className="h-5 w-48 bg-gray-200 rounded-lg" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  if (!eligible) {
    if (isDashboard) return null;
    return (
      <div className="rounded-3xl bg-white border border-gray-100 p-8 shadow-sm text-center space-y-2">
        <h2 className="text-lg font-bold text-winelio-dark">Communauté Winelio</h2>
        <p className="text-sm text-winelio-gray max-w-md mx-auto">
          L’espace communautaire est réservé aux membres actifs du réseau Winelio.
        </p>
      </div>
    );
  }

  return (
    <div className={isDashboard ? "space-y-3" : "space-y-4"}>
      {toastBanner && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-winelio-dark text-white px-4 py-2.5 text-sm font-medium shadow-md flex items-center justify-between"
        >
          <span>{toastBanner}</span>
          <button
            type="button"
            onClick={() => setToastBanner("")}
            className="text-white/70 hover:text-white text-xs ml-3"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Bandeau d'alerte dédié aux 3 Super Admins lorsqu'un signalement est à étudier */}
      {isSuperAdmin && pendingReportCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-amber-950 shadow-2xs">
          <div className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true">🛡️</span>
            <span>
              {pendingReportCount} signalement{pendingReportCount > 1 ? "s" : ""} de message non conforme en attente d’étude par les 3 Super Admins
            </span>
          </div>
          <Link
            href="/gestion-reseau/messagerie"
            className="px-3 py-1 rounded-xl bg-winelio-orange text-white text-xs font-bold hover:brightness-105 transition"
          >
            Étudier les signalements →
          </Link>
        </div>
      )}

      <div className={isDashboard || !groupsEnabled ? "w-full" : "max-w-3xl mx-auto"}>
        <section
          className={`rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col overflow-hidden ${
            isDashboard ? "" : "min-h-[70dvh]"
          }`}
        >
          {!activeChannel ? (
            <div className="p-8 text-center text-sm text-winelio-gray">
              Chargement de la communauté Winelio…
            </div>
          ) : (
            <>
              {/* En-tête de l'espace communautaire */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white text-lg shrink-0 shadow-xs">
                    <span aria-hidden="true">💬</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isDashboard ? (
                        <h3 className="font-bold text-base sm:text-lg text-winelio-dark truncate">
                          Communauté Winelio
                        </h3>
                      ) : (
                        <h1 className="font-bold text-base sm:text-lg text-winelio-dark truncate">
                          {activeChannel.name}
                        </h1>
                      )}
                      {activeChannel.isMuted && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-winelio-gray font-medium shrink-0">
                          🔕 Muet
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-winelio-gray">
                      {activeChannel.kind === "announcements" && onlineCount > 0 && (
                        <span
                          aria-live="polite"
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/85 text-emerald-700 dark:bg-emerald-950/45 dark:border-emerald-800/80 dark:text-emerald-300 text-[11px] font-semibold shrink-0"
                        >
                          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                            <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          <span className="tabular-nums">
                            {onlineCount} {onlineCount > 1 ? "personnes en ligne" : "personne en ligne"}
                          </span>
                        </span>
                      )}
                      <span>
                        {activeChannel.memberCount} membre{activeChannel.memberCount > 1 ? "s" : ""}
                        <span className="hidden sm:inline">
                          {" "}· Messages du réseau, annonces officielles & nouveaux inscrits
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Bouton "+ Nouveau message" ouvert à tous les membres (+ Annonce officielle pour Super Admin) */}
                  {activeChannel.canPostTopLevel && (
                    <button
                      type="button"
                      aria-expanded={showComposer}
                      onClick={handleClickNewMessage}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-semibold shadow-sm hover:brightness-105 active:scale-[0.98] transition inline-flex items-center gap-1.5"
                    >
                      <span aria-hidden="true">{showComposer ? "✕" : "✍️"}</span>
                      <span>
                        {showComposer
                          ? "Fermer"
                          : isSuperAdmin
                          ? "Nouveau / Annonce"
                          : "Nouveau message"}
                      </span>
                    </button>
                  )}

                  {!isDashboard && (
                    <>
                      <button
                        type="button"
                        popoverTarget={mutePopoverId}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-winelio-gray hover:text-winelio-dark hover:bg-gray-50 transition flex items-center gap-1.5"
                        title="Gérer la sourdine de cet espace"
                      >
                        <span aria-hidden="true">{activeChannel.isMuted ? "🔕" : "🔔"}</span>
                        <span className="hidden sm:inline">
                          {activeChannel.isMuted ? "En sourdine" : "Sourdine"}
                        </span>
                      </button>

                      <Link
                        href="/settings#messaging-preferences"
                        className="p-2 rounded-xl border border-gray-200 text-winelio-gray hover:text-winelio-orange hover:bg-gray-50 transition"
                        title="Réglages des notifications"
                        aria-label="Réglages des notifications"
                      >
                        <svg
                          aria-hidden="true"
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.75}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </Link>

                      <div
                        id={mutePopoverId}
                        ref={mutePopoverRef}
                        popover="auto"
                        className="msg-anchored-popover rounded-2xl border border-gray-200 bg-popover p-2 text-popover-foreground shadow-xl min-w-52 z-50"
                      >
                        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-winelio-gray">
                          Notifications
                        </p>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => void handleMuteChange("off")}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-100 transition"
                          >
                            🔔 Activer les notifications
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMuteChange("1h")}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-100 transition"
                          >
                            🔕 Mettre en sourdine 1 heure
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMuteChange("24h")}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-100 transition"
                          >
                            🔕 Mettre en sourdine 24 heures
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMuteChange("forever")}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-100 transition"
                          >
                            🔕 Toujours en sourdine
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Onglets de filtre rapides */}
              <div className="px-4 sm:px-6 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2 overflow-x-auto scrollbar-none">
                <button
                  type="button"
                  aria-pressed={feedFilter === "all"}
                  onClick={() => setFeedFilter("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition shrink-0 ${
                    feedFilter === "all"
                      ? "bg-winelio-orange text-white shadow-xs"
                      : "bg-white text-winelio-gray border border-gray-200 hover:text-winelio-dark"
                  }`}
                >
                  Tout le fil
                </button>
                <button
                  type="button"
                  aria-pressed={feedFilter === "official"}
                  onClick={() => setFeedFilter("official")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition shrink-0 ${
                    feedFilter === "official"
                      ? "bg-winelio-orange text-white shadow-xs"
                      : "bg-white text-winelio-gray border border-gray-200 hover:text-winelio-dark"
                  }`}
                >
                  📢 Annonces officielles
                </button>
                <button
                  type="button"
                  aria-pressed={feedFilter === "community"}
                  onClick={() => setFeedFilter("community")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition shrink-0 ${
                    feedFilter === "community"
                      ? "bg-winelio-orange text-white shadow-xs"
                      : "bg-white text-winelio-gray border border-gray-200 hover:text-winelio-dark"
                  }`}
                >
                  💬 Messages membres
                </button>
                <button
                  type="button"
                  aria-pressed={feedFilter === "welcome"}
                  onClick={() => setFeedFilter("welcome")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition shrink-0 ${
                    feedFilter === "welcome"
                      ? "bg-winelio-orange text-white shadow-xs"
                      : "bg-white text-winelio-gray border border-gray-200 hover:text-winelio-dark"
                  }`}
                >
                  👋 Nouveaux membres
                </button>
              </div>

              {/* Formulaire "+ Nouveau message" (membres) / "Annonce officielle" (Super Admin) */}
              {showComposer && (
                <form
                  aria-labelledby={composerHeadingId}
                  onSubmit={(e) => void handleSendMain(e)}
                  className="p-4 sm:p-5 border-b border-orange-100 bg-orange-50/35 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 id={composerHeadingId} className="text-sm font-bold text-winelio-dark">
                      {isSuperAdmin && composerIsOfficial
                        ? "📢 Publier une annonce officielle Winelio"
                        : "✍️ Écrire un message à toute la communauté Winelio"}
                    </h4>
                  </div>

                  {isSuperAdmin && (
                    <fieldset className="space-y-1.5">
                      <legend className="text-xs font-semibold text-winelio-gray">
                        Nature de la publication
                      </legend>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        <label
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                            composerIsOfficial
                              ? "border-winelio-orange bg-white text-winelio-orange shadow-2xs"
                              : "border-gray-200 bg-white/70 text-winelio-gray"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`post-kind-${instanceId}`}
                            checked={composerIsOfficial}
                            onChange={() => setComposerIsOfficial(true)}
                            className="accent-winelio-orange"
                          />
                          <span>📢 Annonce officielle Winelio</span>
                        </label>
                        <label
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                            !composerIsOfficial
                              ? "border-winelio-orange bg-white text-winelio-orange shadow-2xs"
                              : "border-gray-200 bg-white/70 text-winelio-gray"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`post-kind-${instanceId}`}
                            checked={!composerIsOfficial}
                            onChange={() => setComposerIsOfficial(false)}
                            className="accent-winelio-orange"
                          />
                          <span>💬 Message communautaire</span>
                        </label>
                      </div>
                    </fieldset>
                  )}

                  {isSuperAdmin && composerIsOfficial && (
                    <div className="space-y-1">
                      <label
                        htmlFor={composerTitleId}
                        className="block text-xs font-semibold text-winelio-dark"
                      >
                        Titre de l’annonce (optionnel)
                      </label>
                      <input
                        id={composerTitleId}
                        name="title"
                        type="text"
                        value={composerTitle}
                        onChange={(e) => setComposerTitle(e.target.value)}
                        placeholder="Ex. Formation nationale ce jeudi à 19h"
                        maxLength={140}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-base sm:text-sm font-medium text-winelio-dark focus-visible:outline-2 focus-visible:outline-winelio-orange"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label
                      htmlFor={composerBodyId}
                      className="block text-xs font-semibold text-winelio-dark"
                    >
                      Votre message à la communauté
                    </label>
                    <textarea
                      id={composerBodyId}
                      ref={composerTextareaRef}
                      name="content"
                      value={composerText}
                      onChange={(e) => {
                        setComposerText(e.target.value);
                        if (composerError) setComposerError("");
                      }}
                      placeholder={
                        isSuperAdmin && composerIsOfficial
                          ? "Partagez une actualité officielle, une nouveauté ou une réussite du réseau…"
                          : "Partagez une question, un retour d’expérience ou une réussite avec toute la communauté Winelio…"
                      }
                      rows={3}
                      maxLength={2000}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-base sm:text-sm text-winelio-dark focus-visible:outline-2 focus-visible:outline-winelio-orange"
                    />
                  </div>

                  {composerPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {composerPhotos.map((att) => (
                        <div key={att.key} className="relative">
                          <img
                            src={att.url}
                            alt="Aperçu de la photo jointe"
                            className="h-16 w-24 object-cover rounded-xl border border-gray-200"
                          />
                          <button
                            type="button"
                            aria-label="Retirer cette photo"
                            onClick={() =>
                              setComposerPhotos((prev) => prev.filter((x) => x.key !== att.key))
                            }
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {composerError && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {composerError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div data-msg-popover-root className="relative">
                        {renderEmojiPalette(
                          "composer",
                          "msg-emoji-popover--floating absolute bottom-full left-0 mb-2",
                        )}
                        <button
                          type="button"
                          aria-expanded={emojiPickerTarget === "composer"}
                          onClick={() =>
                            setEmojiPickerTarget((prev) =>
                              prev === "composer" ? null : "composer",
                            )
                          }
                          className={`min-h-9 px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition focus-visible:outline-2 focus-visible:outline-winelio-orange ${
                            emojiPickerTarget === "composer"
                              ? "border-winelio-orange bg-orange-50 text-winelio-orange"
                              : "border-gray-200 bg-white text-winelio-dark hover:bg-gray-50"
                          }`}
                        >
                          <span aria-hidden="true" className="text-sm">
                            😊
                          </span>
                          <span>Émoticônes</span>
                        </button>
                      </div>

                      {activeChannel.canUploadPhoto && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingPhoto}
                          className="min-h-9 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-medium text-winelio-dark hover:bg-gray-50 disabled:opacity-50"
                        >
                          {uploadingPhoto ? "Compression…" : "📷 Joindre une photo"}
                        </button>
                      )}
                      {isSuperAdmin && composerIsOfficial && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-winelio-gray cursor-pointer">
                          <input
                            type="checkbox"
                            checked={composerCommentsEnabled}
                            onChange={(e) => setComposerCommentsEnabled(e.target.checked)}
                            className="accent-winelio-orange"
                          />
                          <span>Autoriser les commentaires</span>
                        </label>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={sending}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-semibold shadow-sm hover:brightness-105 disabled:opacity-50"
                    >
                      {sending
                        ? "Publication…"
                        : isSuperAdmin && composerIsOfficial
                        ? "📢 Publier l’annonce officielle"
                        : "Publier le message"}
                    </button>
                  </div>
                </form>
              )}

              {/* Bandeau des publications épinglées */}
              {pins.length > 0 && (
                <div className="px-4 sm:px-6 py-2.5 bg-amber-50/70 border-b border-amber-100">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      aria-expanded={pinsExpanded}
                      onClick={() => setPinsExpanded((v) => !v)}
                      className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"
                    >
                      <span aria-hidden="true">📌</span>
                      <span>
                        {pins.length} publication{pins.length > 1 ? "s épinglées" : " épinglée"}
                      </span>
                      <span aria-hidden="true" className="text-[10px] text-amber-700">
                        {pinsExpanded ? "▲" : "▼"}
                      </span>
                    </button>
                  </div>
                  {pinsExpanded && (
                    <div className="mt-2 space-y-1.5">
                      {pins.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-white/90 px-3 py-1.5 border border-amber-200/60 text-xs"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-semibold text-winelio-dark">
                              {p.title || p.author.displayName} :
                            </span>{" "}
                            <span className="text-winelio-gray">{p.content || "📷 Photo"}</span>
                          </div>
                          {activeChannel.canPin && (
                            <button
                              type="button"
                              onClick={() => void handleTogglePin(p)}
                              className="text-[11px] text-amber-800 hover:underline shrink-0"
                            >
                              Retirer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Flux des publications */}
              <div className="p-4 sm:p-5 space-y-3.5 bg-winelio-light/35 flex-1">
                {loadingMessages ? (
                  <p className="text-center text-sm text-winelio-gray py-8">
                    Chargement des messages…
                  </p>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <p className="text-2xl" aria-hidden="true">
                      {feedFilter === "welcome" ? "👋" : "💬"}
                    </p>
                    <p className="text-sm font-semibold text-winelio-dark">
                      {feedFilter === "welcome"
                        ? "Aucun message de bienvenue pour le moment"
                        : "Aucun message dans cette vue pour le moment"}
                    </p>
                    <p className="text-xs text-winelio-gray max-w-md mx-auto">
                      Cliquez sur « Nouveau message » en haut à droite pour lancer la discussion avec toute la communauté Winelio !
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => {
                      const isWelcome = msg.messageType === "welcome";
                      const isOfficial = msg.messageType === "announcement";

                      if (msg.isDeleted) {
                        return <div key={msg.id}>{renderModerationTrace(msg)}</div>;
                      }

                      return (
                        <article
                          key={msg.id}
                          className={`rounded-2xl border p-4 sm:p-5 shadow-2xs space-y-3 ${
                            isOfficial
                              ? "border-winelio-orange/25 bg-gradient-to-br from-orange-50/45 via-white to-white"
                              : isWelcome
                              ? "border-amber-200/70 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30"
                              : "border-gray-100 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <ProfileAvatar
                                name={msg.author.displayName}
                                avatar={msg.author.avatar}
                                className="h-10 w-10"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-sm text-winelio-dark">
                                    {msg.author.displayName}
                                  </span>
                                  {renderRoleBadge(msg.author.badge, msg.messageType)}
                                  {msg.isPinned && (
                                    <span className="text-[11px] font-semibold text-amber-700">
                                      📌 Épinglé
                                    </span>
                                  )}
                                  {isSuperAdmin && (msg.pendingReportCount ?? 0) > 0 && (
                                    <Link
                                      href="/gestion-reseau/messagerie"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200"
                                    >
                                      🚩 {msg.pendingReportCount} signalement
                                      {(msg.pendingReportCount ?? 0) > 1 ? "s" : ""}
                                    </Link>
                                  )}
                                </div>
                                <p className="text-xs text-winelio-gray">
                                  {formatShortTime(msg.createdAt)}
                                  {msg.editedAt ? " · modifié" : ""}
                                </p>
                              </div>
                            </div>

                            {renderActionMenu(msg)}
                          </div>

                          {msg.title && (
                            <h4 className="text-base sm:text-lg font-bold text-winelio-dark">
                              {msg.title}
                            </h4>
                          )}
                          {msg.content && (
                            <p className="text-sm leading-relaxed text-winelio-dark whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          )}

                          {msg.attachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                              {msg.attachments.map((att) => (
                                <button
                                  key={att.key}
                                  type="button"
                                  onClick={() => setLightboxUrl(att.url)}
                                  className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 block text-left"
                                >
                                  <img
                                    src={att.url}
                                    alt="Photo partagée dans la communauté"
                                    width={att.width || 800}
                                    height={att.height || 500}
                                    style={{
                                      aspectRatio:
                                        att.width && att.height
                                          ? `${att.width} / ${att.height}`
                                          : "16 / 10",
                                    }}
                                    className="w-full object-cover max-h-80"
                                  />
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Barre d'interactions style Messenger / Facebook */}
                          <div className="pt-2.5 border-t border-gray-100/90 flex flex-wrap items-center justify-between gap-2">
                            {renderMessengerReactionControl(msg)}

                            <button
                              type="button"
                              onClick={() => openThreadDrawer(msg)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50/80 text-winelio-orange text-xs font-semibold hover:bg-orange-100/80 transition"
                            >
                              <span aria-hidden="true">💬</span>
                              <span>
                                {msg.replyCount > 0
                                  ? `${msg.replyCount} réponse${msg.replyCount > 1 ? "s" : ""}`
                                  : !msg.commentsEnabled
                                  ? "Commentaires fermés"
                                  : isWelcome
                                  ? "Souhaiter la bienvenue"
                                  : "Répondre"}
                              </span>
                            </button>
                          </div>
                        </article>
                      );
                    })}

                    {!isDashboard && hasMore && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => void handleLoadOlder()}
                          disabled={loadingOlder}
                          className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-winelio-gray hover:text-winelio-dark"
                        >
                          {loadingOlder ? "Chargement…" : "Voir les messages précédents"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => void handleSelectPhoto(e)}
                className="hidden"
              />

              {isDashboard ? (
                <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-white">
                  <Link
                    href="/messages"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-winelio-orange/10 px-4 py-2.5 text-sm font-semibold text-winelio-orange transition-colors hover:bg-winelio-orange/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-winelio-orange"
                  >
                    <span>Voir toute la messagerie communautaire</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/70 text-center text-xs text-winelio-gray">
                  Échanges bienveillants entre membres Winelio · Signalement étudié par les 3 Super Admins.
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── Sheet latéral : Réponses & commentaires regroupés ── */}
      <Sheet
        open={Boolean(threadParent)}
        onOpenChange={(open) => {
          if (!open) {
            setEmojiPickerTarget(null);
            setThreadParent(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="p-4 border-b border-gray-100">
            <SheetTitle>
              {threadParent?.messageType === "welcome" ? "Mots de bienvenue" : "Réponses"}
            </SheetTitle>
            <SheetDescription>
              Discussion regroupée sous ce message
            </SheetDescription>
          </SheetHeader>

          {threadParent && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="rounded-2xl bg-orange-50/60 border border-orange-100 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-winelio-dark">
                      {threadParent.author.displayName}
                    </span>
                    {renderRoleBadge(threadParent.author.badge, threadParent.messageType)}
                    <span className="text-[11px] text-winelio-gray">
                      · {formatShortTime(threadParent.createdAt)}
                    </span>
                  </div>
                  {threadParent.title && (
                    <p className="font-bold text-sm text-winelio-dark">{threadParent.title}</p>
                  )}
                  <p className="text-xs text-winelio-dark whitespace-pre-wrap">
                    {threadParent.content}
                  </p>
                </div>

                {loadingThread ? (
                  <p className="text-xs text-center text-winelio-gray py-6">
                    Chargement des réponses…
                  </p>
                ) : threadReplies.length === 0 ? (
                  <p className="text-xs text-center text-winelio-gray py-6">
                    {threadParent.messageType === "welcome"
                      ? "Soyez le premier à lui souhaiter la bienvenue !"
                      : "Aucune réponse pour l’instant."}
                  </p>
                ) : (
                  threadReplies.map((rep) =>
                    rep.isDeleted ? (
                      <div key={rep.id}>{renderModerationTrace(rep, true)}</div>
                    ) : (
                      <div
                        key={rep.id}
                        className="rounded-2xl border border-gray-100 bg-white p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ProfileAvatar
                              name={rep.author.displayName}
                              avatar={rep.author.avatar}
                              className="h-7 w-7"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-xs text-winelio-dark truncate">
                                  {rep.author.displayName}
                                </span>
                                {renderRoleBadge(rep.author.badge, rep.messageType)}
                              </div>
                              <span className="text-[10px] text-winelio-gray block">
                                {formatShortTime(rep.createdAt)}
                              </span>
                            </div>
                          </div>

                          {renderActionMenu(rep)}
                        </div>

                        <p className="text-xs text-winelio-dark whitespace-pre-wrap break-words pl-9">
                          {rep.content}
                        </p>

                        <div className="pl-9">{renderMessengerReactionControl(rep, true)}</div>
                      </div>
                    ),
                  )
                )}
              </div>

              {threadParent.commentsEnabled === false && !isSuperAdmin ? (
                <div className="p-3 border-t border-gray-100 bg-gray-50 text-center text-xs text-winelio-gray">
                  Les commentaires sont fermés sous cette publication.
                </div>
              ) : activeChannel?.activeRestriction ? (
                <div className="p-3 border-t border-amber-200 bg-amber-50 text-center text-xs text-amber-900">
                  Votre compte est temporairement en lecture seule sur cet espace.
                </div>
              ) : (
                <form
                  data-msg-popover-root
                  onSubmit={(e) => void handleSendThreadReply(e)}
                  className="relative p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-gray-100 bg-white flex items-center gap-2"
                >
                  {renderEmojiPalette("reply", "absolute bottom-full left-3 right-3 mb-2")}

                  <label htmlFor={`reply-input-${instanceId}`} className="sr-only">
                    Votre réponse
                  </label>
                  <div className="flex-1 min-w-0 flex items-center rounded-xl border border-gray-300 bg-white pr-1 focus-within:outline-2 focus-within:outline-winelio-orange">
                    <input
                      id={`reply-input-${instanceId}`}
                      ref={replyInputRef}
                      name="reply"
                      type="text"
                      value={threadInput}
                      onChange={(e) => setThreadInput(e.target.value)}
                      placeholder={
                        threadParent.messageType === "welcome"
                          ? "Écrire un mot de bienvenue…"
                          : "Écrire une réponse…"
                      }
                      maxLength={2000}
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 text-base sm:text-sm text-winelio-dark focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Insérer une émoticône"
                      aria-expanded={emojiPickerTarget === "reply"}
                      title="Insérer une émoticône"
                      onClick={() =>
                        setEmojiPickerTarget((prev) => (prev === "reply" ? null : "reply"))
                      }
                      className={`min-w-9 min-h-9 shrink-0 rounded-lg flex items-center justify-center text-lg transition focus-visible:outline-2 focus-visible:outline-winelio-orange ${
                        emojiPickerTarget === "reply"
                          ? "bg-winelio-orange/15 text-winelio-orange"
                          : "text-winelio-gray hover:bg-orange-50 hover:text-winelio-orange"
                      }`}
                    >
                      <span aria-hidden="true">😊</span>
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={sendingThread || !threadInput.trim()}
                    className="min-h-10 px-3.5 py-2 rounded-xl bg-winelio-orange text-white text-xs font-semibold hover:brightness-105 disabled:opacity-50 shrink-0"
                  >
                    {sendingThread ? "…" : "Envoyer"}
                  </button>
                </form>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Dialog : Modification d'un message ── */}
      <Dialog
        open={Boolean(editingMessage)}
        onOpenChange={(open) => {
          if (!open) {
            setEmojiPickerTarget(null);
            setEditingMessage(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le message</DialogTitle>
            <DialogDescription>
              Ajustez le contenu de votre publication.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-3">
            {editingMessage?.messageType === "announcement" && !editingMessage.parentMessageId && (
              <div className="space-y-1">
                <label
                  htmlFor={`edit-title-${instanceId}`}
                  className="block text-xs font-semibold text-winelio-dark"
                >
                  Titre (optionnel)
                </label>
                <input
                  id={`edit-title-${instanceId}`}
                  name="title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={140}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`edit-body-${instanceId}`}
                  className="block text-xs font-semibold text-winelio-dark"
                >
                  Message
                </label>
                <div data-msg-popover-root className="relative">
                  {renderEmojiPalette(
                    "edit",
                    "msg-emoji-popover--floating absolute bottom-full right-0 mb-1.5",
                  )}
                  <button
                    type="button"
                    aria-expanded={emojiPickerTarget === "edit"}
                    onClick={() =>
                      setEmojiPickerTarget((prev) => (prev === "edit" ? null : "edit"))
                    }
                    className={`min-h-7 px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition focus-visible:outline-2 focus-visible:outline-winelio-orange ${
                      emojiPickerTarget === "edit"
                        ? "border-winelio-orange bg-orange-50 text-winelio-orange"
                        : "border-gray-200 bg-white text-winelio-dark hover:bg-gray-50"
                    }`}
                  >
                    <span aria-hidden="true">😊</span>
                    <span>Émoticônes</span>
                  </button>
                </div>
              </div>
              <textarea
                id={`edit-body-${instanceId}`}
                ref={editTextareaRef}
                name="content"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full rounded-xl border border-gray-300 p-3 text-base sm:text-sm"
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditingMessage(null)}
                className="px-4 py-2 rounded-xl border text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingEdit || !editText.trim()}
                className="px-4 py-2 rounded-xl bg-winelio-orange text-white text-xs font-semibold disabled:opacity-50"
              >
                {savingEdit ? "Enregistrement…" : "Enregistrer"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Confirmation de suppression ou masquage avec trace ── */}
      <Dialog
        open={Boolean(moderationDialog)}
        onOpenChange={(open) => {
          if (!open) setModerationDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {moderationDialog?.mode === "mask"
                ? "Masquer ce message (avec trace)"
                : moderationDialog?.target.isOwn
                ? "Supprimer votre message"
                : "Supprimer ce message (modération)"}
            </DialogTitle>
            <DialogDescription>
              {moderationDialog?.mode === "mask"
                ? "Le contenu sera caché aux membres et remplacé par une mention « Message masqué par la modération Winelio ». Les 3 Super Admins conserveront l’archive pour examen."
                : "Le contenu et les éventuelles photos seront effacés, mais une trace indiquant la suppression restera visible dans le fil."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleConfirmModerationAction(e)} className="space-y-3">
            {(moderationDialog?.mode === "mask" || !moderationDialog?.target.isOwn) && (
              <div className="space-y-1">
                <label
                  htmlFor={`mod-reason-${instanceId}`}
                  className="block text-xs font-semibold text-winelio-dark"
                >
                  Motif affiché sur la trace (optionnel)
                </label>
                <input
                  id={`mod-reason-${instanceId}`}
                  name="reason"
                  type="text"
                  value={moderationReasonInput}
                  onChange={(e) => setModerationReasonInput(e.target.value)}
                  placeholder="Ex. Contenu non conforme à la charte Winelio"
                  maxLength={300}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm"
                />
              </div>
            )}
            <DialogFooter>
              <button
                type="button"
                onClick={() => setModerationDialog(null)}
                className="px-4 py-2 rounded-xl border text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submittingModeration}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50 ${
                  moderationDialog?.mode === "mask" ? "bg-amber-600" : "bg-red-600"
                }`}
              >
                {submittingModeration
                  ? "Traitement…"
                  : moderationDialog?.mode === "mask"
                  ? "🛡️ Masquer avec trace"
                  : "🗑️ Confirmer la suppression"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Signalement d'un message non conforme (étudié par les 3 Super Admins) ── */}
      <Dialog
        open={Boolean(reportTarget)}
        onOpenChange={(open) => {
          if (!open) setReportTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Signaler un message non conforme</DialogTitle>
            <DialogDescription>
              Ce signalement est transmis en toute confidentialité aux 3 Super Administrateurs Winelio pour examen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmitReport(e)} className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-winelio-dark">
                Motif du signalement
              </legend>
              <div className="space-y-1.5 pt-1">
                {REPORT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                      reportReason === opt.value
                        ? "border-winelio-orange bg-orange-50/50 font-semibold text-winelio-dark"
                        : "border-gray-200 hover:bg-gray-50 text-winelio-dark"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`report-reason-${instanceId}`}
                      value={opt.value}
                      checked={reportReason === opt.value}
                      onChange={() => setReportReason(opt.value)}
                      className="accent-winelio-orange"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1">
              <label
                htmlFor={reportDetailsId}
                className="block text-xs font-semibold text-winelio-dark"
              >
                Précision pour les Super Admins (optionnel)
              </label>
              <textarea
                id={reportDetailsId}
                name="details"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Expliquez brièvement en quoi ce message est non conforme…"
                rows={2}
                maxLength={500}
                className="w-full rounded-xl border border-gray-300 p-3 text-base sm:text-sm"
              />
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-xl border text-xs font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submittingReport}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {submittingReport ? "Envoi…" : "🚩 Transmettre aux 3 Super Admins"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Charte communautaire première publication ── */}
      <Dialog open={charterOpen} onOpenChange={setCharterOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Charte de la communauté Winelio</DialogTitle>
            <DialogDescription>
              Pour publier et échanger sereinement avec l’ensemble du réseau, merci de valider ces 3 engagements :
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2.5 text-sm text-winelio-dark py-1">
            <li className="flex items-start gap-2.5">
              <span className="text-winelio-orange font-bold">1.</span>
              <span>
                <strong>Bienveillance et entraide :</strong> partagez vos questions, conseils et réussites dans un esprit constructif.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-winelio-orange font-bold">2.</span>
              <span>
                <strong>Confidentialité des clients (RGPD) :</strong> ne publiez jamais les coordonnées privées d’un client ou prospect dans le fil — passez toujours par <em>Recommandations</em>.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="text-winelio-orange font-bold">3.</span>
              <span>
                <strong>Respect du réseau :</strong> tout message non conforme peut être signalé, masqué ou supprimé par les 3 Super Administrateurs Winelio.
              </span>
            </li>
          </ul>
          <DialogFooter>
            <button
              type="button"
              onClick={() => void handleAcceptCharter()}
              disabled={acceptingCharter}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              {acceptingCharter ? "Validation…" : "J’accepte la charte et je participe"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Qui a réagi (style Facebook / Messenger avec onglets par émotion) ── */}
      <Dialog
        open={Boolean(reactionsModalTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReactionsModalTarget(null);
            setReactionsDetail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-0 gap-0 overflow-hidden">
          {(() => {
            const countsSource =
              reactionsDetail?.counts ??
              (reactionsModalTarget?.reactions.map((r) => ({
                emoji: r.emoji,
                count: r.count,
              })) ??
                []);
            const totalCount =
              reactionsDetail?.total ??
              reactionsModalTarget?.totalReactions ??
              countsSource.reduce((acc, c) => acc + c.count, 0);
            const tabItems = [
              { key: "all", emoji: null as string | null, label: "Tout", count: totalCount },
              ...countsSource.map((c) => ({
                key: c.emoji,
                emoji: c.emoji,
                label: REACTION_META[c.emoji]?.label ?? c.emoji,
                count: c.count,
              })),
            ];
            const tabKeys = tabItems.map((t) => t.key);
            const effectiveTab = tabKeys.includes(activeReactionTab) ? activeReactionTab : "all";

            return (
              <>
                <DialogHeader className="px-5 pt-4 pb-3 bg-gradient-to-b from-orange-50/45 to-transparent dark:from-slate-800/50">
                  <div className="flex items-center gap-2 pr-7">
                    <span className="inline-flex items-center -space-x-1" aria-hidden="true">
                      {countsSource.slice(0, 3).map((c) => (
                        <span
                          key={c.emoji}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-slate-900 ring-2 ring-white dark:ring-slate-900 shadow-xs text-sm"
                        >
                          {c.emoji}
                        </span>
                      ))}
                    </span>
                    <DialogTitle className="text-base font-bold text-winelio-dark dark:text-white">
                      Réactions
                    </DialogTitle>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100/90 text-winelio-orange tabular-nums">
                      {totalCount}
                    </span>
                  </div>
                  <DialogDescription className="text-xs text-winelio-gray truncate">
                    {reactionsModalTarget?.messageType === "welcome"
                      ? `Mot de bienvenue · ${reactionsModalTarget.author.displayName}`
                      : `Publication de ${reactionsModalTarget?.author.displayName ?? "Membre"}`}
                  </DialogDescription>
                </DialogHeader>

                {/* Barre d'onglets par émotion (tablist accessible, sélection au focus clavier) */}
                <div
                  role="tablist"
                  aria-label="Filtrer les membres par réaction"
                  onKeyDown={(e) => handleReactionTabKeyDown(e, tabKeys)}
                  className="msg-reactions-tablist px-3 border-b border-gray-100 dark:border-slate-800"
                >
                  {tabItems.map((t) => {
                    const selected = effectiveTab === t.key;
                    const tabDomId = `react-tab-${instanceId}-${
                      t.key === "all" ? "all" : encodeURIComponent(t.key)
                    }`;
                    return (
                      <button
                        key={t.key}
                        ref={(el) => {
                          reactionTabRefs.current[t.key] = el;
                        }}
                        id={tabDomId}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => setActiveReactionTab(t.key)}
                        className="msg-reactions-tab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-winelio-orange"
                      >
                        {t.emoji && (
                          <span aria-hidden="true" className="text-sm leading-none">
                            {t.emoji}
                          </span>
                        )}
                        <span>{t.label}</span>
                        <span className="tabular-nums text-[11px] opacity-75">{t.count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Panneaux de liste des membres ayant réagi */}
                {tabItems.map((t) => {
                  const selected = effectiveTab === t.key;
                  const tabDomId = `react-tab-${instanceId}-${
                    t.key === "all" ? "all" : encodeURIComponent(t.key)
                  }`;
                  const filteredReactors = (reactionsDetail?.reactors ?? []).filter((r) =>
                    t.key === "all" ? true : r.emoji === t.key,
                  );

                  return (
                    <div
                      key={t.key}
                      role="tabpanel"
                      aria-labelledby={tabDomId}
                      hidden={!selected}
                      tabIndex={selected ? 0 : undefined}
                      className="outline-none"
                    >
                      <div className="max-h-[56dvh] overflow-y-auto overscroll-contain px-2.5 py-2">
                        {loadingReactionsDetail && !reactionsDetail ? (
                          <div className="space-y-1.5 py-1" aria-live="polite">
                            {[0, 1, 2].map((idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl animate-pulse"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-800" />
                                  <div className="space-y-1.5">
                                    <div className="h-3.5 w-28 rounded bg-gray-200 dark:bg-slate-800" />
                                    <div className="h-2.5 w-16 rounded bg-gray-100 dark:bg-slate-800/70" />
                                  </div>
                                </div>
                                <div className="h-6 w-16 rounded-full bg-gray-100 dark:bg-slate-800" />
                              </div>
                            ))}
                          </div>
                        ) : filteredReactors.length === 0 ? (
                          <p className="py-8 text-center text-xs text-winelio-gray">
                            Aucune réaction dans cette catégorie pour le moment.
                          </p>
                        ) : (
                          <ul className="divide-y divide-gray-100/80 dark:divide-slate-800/70">
                            {filteredReactors.map((r) => {
                              const meta = REACTION_META[r.emoji];
                              return (
                                <li
                                  key={`${r.userId}-${r.emoji}`}
                                  className="flex items-center justify-between gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50/90 dark:hover:bg-slate-800/50 transition"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {/* Avatar + macaron d'émoticône en coin style Messenger / Facebook */}
                                    <div className="relative shrink-0">
                                      <ProfileAvatar
                                        name={r.displayName}
                                        avatar={r.avatar}
                                        className="h-10 w-10"
                                      />
                                      <span
                                        aria-hidden="true"
                                        className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-900 ring-2 ring-white dark:ring-slate-900 shadow-xs flex items-center justify-center text-[11px] leading-none"
                                      >
                                        {r.emoji}
                                      </span>
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-semibold text-winelio-dark dark:text-white truncate">
                                          {r.displayName}
                                        </span>
                                        {r.isViewer && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-winelio-orange">
                                            Vous
                                          </span>
                                        )}
                                        {renderRoleBadge(r.badge)}
                                      </div>
                                      <p className="text-[11px] text-winelio-gray">
                                        {meta?.label ?? "Réaction"} · {formatShortTime(r.createdAt)}
                                      </p>
                                    </div>
                                  </div>

                                  {r.isViewer ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveOwnReactionFromModal(r.emoji)}
                                      className="shrink-0 px-2.5 py-1 rounded-full border border-gray-200 dark:border-slate-700 text-[11px] font-semibold text-winelio-gray hover:text-red-600 hover:border-red-200 hover:bg-red-50/60 transition"
                                      title="Retirer votre réaction"
                                    >
                                      Retirer
                                    </button>
                                  ) : (
                                    <span
                                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                                        meta?.activeClass ??
                                        "bg-gray-50 text-winelio-dark border-gray-200"
                                      }`}
                                    >
                                      <span aria-hidden="true">{r.emoji}</span>
                                      <span>{meta?.label ?? "Réaction"}</span>
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Lightbox photo ── */}
      <Dialog
        open={Boolean(lightboxUrl)}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl rounded-2xl p-2 bg-black/95 border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Aperçu de la photo</DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Photo en grand format"
              className="max-h-[82dvh] w-auto mx-auto rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
