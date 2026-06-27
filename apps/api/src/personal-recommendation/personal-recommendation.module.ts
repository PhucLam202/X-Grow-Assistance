import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MongoModule } from '../mongo/mongo.module';
import { PersonalRecommendationController } from './personal-recommendation.controller';
import { PersonalRecommendationService } from './personal-recommendation.service';

@Module({
  imports: [AuthModule, MongoModule],
  controllers: [PersonalRecommendationController],
  providers: [PersonalRecommendationService],
})
export class PersonalRecommendationModule {}
