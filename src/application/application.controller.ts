import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ApplicationService } from './application.service'
import { CreateApplicationDto } from './dto/create-application.dto'
import { DecideApplicationDto } from './dto/decide-application.dto'
import { ApplicationRankingService } from './ranking/application-ranking.service'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationController {
  constructor(
    private readonly service: ApplicationService,
    private readonly ranking: ApplicationRankingService,
  ) {}

  @Post('applications')
  @Roles(Role.STUDENT)
  apply(@Body() dto: CreateApplicationDto, @Req() req: { user: { sub: number } }) {
    return this.service.apply(dto.offerId, req.user.sub, dto.motivation)
  }

  @Get('offers/:offerId/applications')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  listByOffer(@Param('offerId', ParseIntPipe) offerId: number, @Req() req: { user: { sub: number; role: Role } }) {
    return this.service.listByOffer(offerId, req.user.sub, req.user.role)
  }

  // No crea nada: devuelve una sugerencia de orden. Nest respondería 201 en un POST.
  @Post('offers/:offerId/applications/rank')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.COMPANY, Role.COORDINATOR)
  rank(@Param('offerId', ParseIntPipe) offerId: number, @Req() req: { user: { sub: number; role: Role } }) {
    return this.ranking.rank(offerId, req.user.sub, req.user.role)
  }

  @Get('applications/me')
  @Roles(Role.STUDENT)
  findMine(@Req() req: { user: { sub: number } }) {
    return this.service.listForStudent(req.user.sub)
  }

  @Patch('applications/:id/decide')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  decide(@Param('id', ParseIntPipe) id: number, @Body() dto: DecideApplicationDto, @Req() req: { user: { sub: number; role: Role } }) {
    return this.service.decide(id, dto.status, req.user.sub, req.user.role)
  }
}
