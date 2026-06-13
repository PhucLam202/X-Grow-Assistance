import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';

@Injectable()
export class MongoService implements OnModuleDestroy {
  private client: MongoClient | null = null;
  private clientPromise: Promise<MongoClient> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async db(): Promise<Db> {
    const client = await this.getClient();
    const dbName = this.configService.get<string>('MONGODB_DB_NAME', 'x_comment_assistant');
    return client.db(dbName);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.clientPromise = null;
    }
  }

  private async getClient(): Promise<MongoClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.clientPromise) {
      const uri = this.configService.get<string>('MONGODB_URI');
      if (!uri) {
        throw new Error('MONGODB_URI is missing');
      }

      this.clientPromise = new MongoClient(uri).connect();
    }

    this.client = await this.clientPromise;
    return this.client;
  }
}
