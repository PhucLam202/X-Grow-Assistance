import { Module } from '@nestjs/common';
import { MongoModule } from '../mongo/mongo.module';
import { PersonalRecommendationController } from './personal-recommendation.controller';
import { PersonalRecommendationService } from './personal-recommendation.service';

@Module({
  imports: [MongoModule],
  controllers: [PersonalRecommendationController],
  providers: [PersonalRecommendationService],
})
export class PersonalRecommendationModule {}
