import type { AppEnv } from "@hori/config";
import type { AppLogger } from "@hori/shared";
import type {
  AudioPlayer,
  VoiceConnection,
  VoiceConnectionState,
} from "@discordjs/voice";
import type {
  BaseGuildVoiceChannel,
  CacheType,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
} from "discord.js";

import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { pipeline, type Readable } from "node:stream";

import {
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";

import { AudioMonitor } from "./audio-monitor";
import { convertPcmToWav, VOICE_SAMPLE_RATE } from "./audio-utils";
import { OpusDecoder } from "./opus";
import { isValidTranscription, openAiTranscribeWav } from "./transcription";

export interface VoiceTranscriptionPayload {
  guildId: string;
  guildName: string;
  voiceChannelId: string;
  textChannelId: string;
  textChannelName?: string | null;
  userId: string;
  username: string;
  displayName?: string | null;
  transcription: string;
  createdAt: Date;
  isModerator: boolean;
}

interface VoiceBinding {
  guildId: string;
  guildName: string;
  voiceChannelId: string;
  voiceChannelName: string;
  textChannelId: string;
  textChannelName?: string | null;
  connection: VoiceConnection;
  listeners: {
    stateChange: (oldState: VoiceConnectionState, newState: VoiceConnectionState) => Promise<void>;
    error: (error: Error) => void;
    speakingStart: (userId: string) => void;
    speakingEnd: (userId: string) => void;
  };
}

interface UserVoiceState {
  buffers: Buffer[];
  totalLength: number;
  lastActive: number;
}

export class VoiceManager extends EventEmitter {
  private readonly bindings = new Map<string, VoiceBinding>();
  private readonly activeMonitors = new Map<string, AudioMonitor>();
  private readonly streams = new Map<string, Readable>();
  private readonly userStates = new Map<string, UserVoiceState>();
  private readonly transcriptionTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly processingUsers = new Set<string>();

  private activeAudioPlayer: AudioPlayer | null = null;

  constructor(
    private readonly client: Client,
    private readonly logger: AppLogger,
    private readonly env: AppEnv,
    private readonly onTranscription: (payload: VoiceTranscriptionPayload) => Promise<void>,
  ) {
    super();
  }

  async handleJoinChannelCommand(interaction: ChatInputCommandInteraction<CacheType>) {
    const member = interaction.member as GuildMember | null;
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: "Сначала зайди в voice channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    const textChannel = interaction.options.getChannel("text-channel") ?? interaction.channel;
    if (!textChannel || !isSupportedTextChannel(textChannel.type)) {
      await interaction.reply({ content: "Нужен текстовый канал для ответов.", flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await this.joinChannel(voiceChannel, textChannel.id, "name" in textChannel ? textChannel.name : null);
      await interaction.reply({
        content:
          `Подключилась к ${voiceChannel.name}. Текстовые ответы пойдут в <#${textChannel.id}>.` +
          (this.env.OPENAI_STT_API_KEY ? "" : "\n⚠️ OPENAI_STT_API_KEY не задан, поэтому распознавание речи сейчас выключено."),
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      this.logger.error({ error }, "voice join failed");
      await interaction.reply({ content: "Не смогла подключиться к voice channel.", flags: MessageFlags.Ephemeral });
    }
  }

  async handleLeaveChannelCommand(interaction: ChatInputCommandInteraction<CacheType>) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    const existed = this.leaveGuild(interaction.guildId);
    await interaction.reply({
      content: existed ? "Отключилась от voice channel." : "Я сейчас не сижу в voice channel.",
      flags: MessageFlags.Ephemeral,
    });
  }

  async handleStatusCommand(interaction: ChatInputCommandInteraction<CacheType>) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Только внутри сервера.", flags: MessageFlags.Ephemeral });
      return;
    }

    const binding = this.bindings.get(interaction.guildId);
    if (!binding) {
      await interaction.reply({ content: "Voice mode сейчас не активен.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      content: [
        `Voice channel: ${binding.voiceChannelName}`,
        `Text channel: <#${binding.textChannelId}>`,
        `STT: ${this.env.OPENAI_STT_API_KEY ? "configured" : "disabled"}`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }

  async joinChannel(
    channel: BaseGuildVoiceChannel,
    textChannelId: string,
    textChannelName?: string | null,
  ) {
    this.leaveGuild(channel.guild.id);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as Parameters<typeof joinVoiceChannel>[0]["adapterCreator"],
      selfDeaf: false,
      selfMute: false,
      group: this.client.user?.id,
    });

    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Ready, 20_000),
      entersState(connection, VoiceConnectionStatus.Signalling, 20_000),
    ]);

    const binding: VoiceBinding = {
      guildId: channel.guild.id,
      guildName: channel.guild.name,
      voiceChannelId: channel.id,
      voiceChannelName: channel.name,
      textChannelId,
      textChannelName,
      connection,
      listeners: {
        stateChange: this.createStateChangeHandler(channel.guild.id),
        error: (error) => {
          this.logger.warn({ error, guildId: channel.guild.id }, "voice connection error");
        },
        speakingStart: (userId) => {
          void this.handleSpeakingStart(channel, userId);
        },
        speakingEnd: (userId) => {
          this.streams.get(buildUserKey(channel.guild.id, userId))?.emit("speakingStopped");
        },
      },
    };

    connection.on("stateChange", binding.listeners.stateChange);
    connection.on("error", binding.listeners.error);
    connection.receiver.speaking.on("start", binding.listeners.speakingStart);
    connection.receiver.speaking.on("end", binding.listeners.speakingEnd);

    this.bindings.set(channel.guild.id, binding);
    await setSelfVoice(this.logger, channel.guild.members.me);
  }

  leaveGuild(guildId: string): boolean {
    const binding = this.bindings.get(guildId);
    if (!binding) {
      return false;
    }

    binding.connection.off("stateChange", binding.listeners.stateChange);
    binding.connection.off("error", binding.listeners.error);
    binding.connection.receiver.speaking.off("start", binding.listeners.speakingStart);
    binding.connection.receiver.speaking.off("end", binding.listeners.speakingEnd);

    for (const userKey of [...this.activeMonitors.keys()]) {
      if (userKey.startsWith(`${guildId}:`)) {
        this.stopMonitoringUser(userKey);
      }
    }

    for (const [userKey, timeout] of this.transcriptionTimeouts) {
      if (userKey.startsWith(`${guildId}:`)) {
        clearTimeout(timeout);
        this.transcriptionTimeouts.delete(userKey);
      }
    }

    binding.connection.destroy();
    this.bindings.delete(guildId);
    return true;
  }

  async playAudioStream(guildId: string, audioStream: Readable) {
    const binding = this.bindings.get(guildId);
    if (!binding) {
      return;
    }

    this.cleanupAudioPlayer(this.activeAudioPlayer);
    const audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.activeAudioPlayer = audioPlayer;
    binding.connection.subscribe(audioPlayer);
    const resource = createAudioResource(audioStream, { inputType: StreamType.Arbitrary });
    audioPlayer.play(resource);
  }

  cleanupAudioPlayer(audioPlayer: AudioPlayer | null) {
    if (!audioPlayer) {
      return;
    }

    audioPlayer.stop();
    audioPlayer.removeAllListeners();
    if (audioPlayer === this.activeAudioPlayer) {
      this.activeAudioPlayer = null;
    }
  }

  private createStateChangeHandler(guildId: string) {
    return async (_oldState: VoiceConnectionState, newState: VoiceConnectionState) => {
      if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.bindings.delete(guildId);
        return;
      }

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        const binding = this.bindings.get(guildId);
        if (!binding) {
          return;
        }

        try {
          await Promise.race([
            entersState(binding.connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(binding.connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          this.leaveGuild(guildId);
        }
      }
    };
  }

  private async handleSpeakingStart(channel: BaseGuildVoiceChannel, userId: string) {
    let member = channel.members.get(userId);
    if (!member) {
      try {
        member = await channel.guild.members.fetch(userId);
      } catch {
        return;
      }
    }

    if (!member || member.user.bot) {
      return;
    }

    await this.monitorMember(member, channel.guild.id);
    this.streams.get(buildUserKey(channel.guild.id, userId))?.emit("speakingStarted");
  }

  private async monitorMember(member: GuildMember, guildId: string) {
    const userKey = buildUserKey(guildId, member.id);
    if (this.activeMonitors.has(userKey)) {
      return;
    }

    const binding = this.bindings.get(guildId);
    if (!binding) {
      return;
    }

    const receiveStream = binding.connection.receiver.subscribe(member.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1_000,
      },
    });

    const opusDecoder = new OpusDecoder(VOICE_SAMPLE_RATE, 1);
    this.streams.set(userKey, opusDecoder);

    pipeline(receiveStream, opusDecoder, (error) => {
      if (error) {
        this.logger.warn({ error, userId: member.id }, "voice pipeline failed");
      }
      this.stopMonitoringUser(userKey);
    });

    this.handleUserStream(userKey, member, binding, opusDecoder);
  }

  private handleUserStream(
    userKey: string,
    member: GuildMember,
    binding: VoiceBinding,
    audioStream: Readable,
  ) {
    if (!this.userStates.has(userKey)) {
      this.userStates.set(userKey, {
        buffers: [],
        totalLength: 0,
        lastActive: Date.now(),
      });
    }

    const state = this.userStates.get(userKey)!;
    const monitor = new AudioMonitor(
      audioStream,
      10_000_000,
      () => {
        const timeout = this.transcriptionTimeouts.get(userKey);
        if (timeout) {
          clearTimeout(timeout);
          this.transcriptionTimeouts.delete(userKey);
        }
      },
      async (buffer) => {
        if (!buffer.length) {
          return;
        }

        state.buffers.push(buffer);
        state.totalLength += buffer.length;
        state.lastActive = Date.now();
        this.debouncedProcessTranscription(userKey, member, binding);
      },
    );

    this.activeMonitors.set(userKey, monitor);
  }

  private debouncedProcessTranscription(userKey: string, member: GuildMember, binding: VoiceBinding) {
    const existing = this.transcriptionTimeouts.get(userKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      void this.processTranscription(userKey, member, binding);
    }, 1_500);
    this.transcriptionTimeouts.set(userKey, timeout);
  }

  private async processTranscription(userKey: string, member: GuildMember, binding: VoiceBinding) {
    if (this.processingUsers.has(userKey)) {
      return;
    }

    const state = this.userStates.get(userKey);
    if (!state || state.buffers.length === 0) {
      return;
    }

    this.processingUsers.add(userKey);
    try {
      const inputBuffer = Buffer.concat(state.buffers, state.totalLength);
      state.buffers.length = 0;
      state.totalLength = 0;

      const wavBuffer = convertPcmToWav(inputBuffer);
      const transcription = await openAiTranscribeWav(this.env, wavBuffer, this.logger);
      if (!isValidTranscription(transcription)) {
        return;
      }

      await this.onTranscription({
        guildId: binding.guildId,
        guildName: binding.guildName,
        voiceChannelId: binding.voiceChannelId,
        textChannelId: binding.textChannelId,
        textChannelName: binding.textChannelName,
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        transcription,
        createdAt: new Date(),
        isModerator: member.permissions.has(PermissionFlagsBits.ManageGuild),
      });
    } catch (error) {
      this.logger.warn({ error, userId: member.id }, "voice transcription processing failed");
    } finally {
      this.processingUsers.delete(userKey);
    }
  }

  private stopMonitoringUser(userKey: string) {
    const monitor = this.activeMonitors.get(userKey);
    if (monitor) {
      monitor.stop();
      this.activeMonitors.delete(userKey);
    }

    const timeout = this.transcriptionTimeouts.get(userKey);
    if (timeout) {
      clearTimeout(timeout);
      this.transcriptionTimeouts.delete(userKey);
    }

    this.streams.delete(userKey);
  }
}

async function setSelfVoice(logger: AppLogger, me?: GuildMember | null) {
  if (me?.voice && me.permissions.has(PermissionFlagsBits.DeafenMembers)) {
    try {
      await me.voice.setDeaf(false);
      await me.voice.setMute(false);
    } catch (error) {
      logger.warn({ error }, "failed to modify self voice state");
    }
  }
}

function buildUserKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

function isSupportedTextChannel(type: ChannelType) {
  return type === ChannelType.GuildText || type === ChannelType.PublicThread || type === ChannelType.PrivateThread;
}