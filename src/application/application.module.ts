import { Module } from '@nestjs/common'
import { OfferModule } from '../offer/offer.module'
import { ApplicationController } from './application.controller'
import { ApplicationService } from './application.service'
import { ApplicationRankingService } from './ranking/application-ranking.service'
import { createRankingProvider } from './ranking/ranking-provider.factory'
import { RANKING_PROVIDER } from './ranking/ranking.provider'

@Module({
  imports: [OfferModule],
  controllers: [ApplicationController],
  providers: [
    ApplicationService,
    ApplicationRankingService,
    // Groq si hay GROQ_API_KEY; si no, un proveedor que responde 503.
    { provide: RANKING_PROVIDER, useFactory: () => createRankingProvider() },
  ],
  exports: [ApplicationService],
})
export class ApplicationModule {}
